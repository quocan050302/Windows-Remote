import type {
  TaskInput,
  TaskRecord,
  TaskAnalysis,
  TestingModuleType,
  TestPlan,
  RunResult,
  StopResult,
  ActionContext,
  CandidateBug,
  EvidenceRecord,
  ReportDraft
} from '@test-io-agent/shared';
import type { AgentStudioDatabase } from '@test-io-agent/storage';
import { AuditLogService, checkActionPermission } from '@test-io-agent/policy-engine';
import { createAiProvider, type AiProvider } from '@test-io-agent/ai-providers';
import {
  BrowserSessionManager,
  browserSessionManager
} from '@test-io-agent/browser-adapter';
import { EvidenceService } from '@test-io-agent/evidence';
import { generateReportDraft, validateReportDraft } from '@test-io-agent/report-engine';
import { detectCandidateBug, verifyCandidateBug } from '@test-io-agent/test-intelligence';

export class AgentOrchestrator {
  private aiProvider: AiProvider;
  private auditLogger: AuditLogService;
  private evidenceService: EvidenceService;
  private activeAbortControllers = new Map<string, AbortController>();

  constructor(
    private db: AgentStudioDatabase,
    private browserManager: BrowserSessionManager = browserSessionManager,
    providerType: string = 'deterministic'
  ) {
    this.aiProvider = createAiProvider(providerType);
    this.auditLogger = new AuditLogService(db);
    this.evidenceService = new EvidenceService(db);
  }

  /**
   * Analyze Task input and detect scope, requirements and missing info
   * Contract: analyzeTask(input): Promise<TaskAnalysis>
   */
  public async analyzeTask(input: TaskInput): Promise<TaskAnalysis> {
    const analysis = await this.aiProvider.analyzeTask({
      title: input.title,
      description: input.description
    });

    // Save or update task in DB
    const taskId = input.id || `task_${Date.now()}`;
    analysis.taskId = taskId;
    const taskRecord: TaskRecord = {
      id: taskId,
      title: input.title,
      description: input.description,
      sourcePlatform: input.sourcePlatform || 'TEST_IO',
      targetUrl: input.targetUrl,
      targetApp: input.targetApp,
      cycleId: input.cycleId,
      status: analysis.missingInformation.length > 0 ? 'NEEDS_REVIEW' : 'READY',
      executionMode: 'COPILOT_MODE',
      analysis,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    this.db.saveTask(taskRecord);
    return analysis;
  }

  /**
   * Classify Testing Module Type
   * Contract: classifyTestingModule(analysis): TestingModuleType
   */
  public classifyTestingModule(analysis: TaskAnalysis): TestingModuleType {
    return analysis.taskType || 'UNKNOWN';
  }

  /**
   * Generate Test Plan from Task Analysis
   * Contract: generateTestPlan(analysis): Promise<TestPlan>
   */
  public async generateTestPlan(analysis: TaskAnalysis): Promise<TestPlan> {
    const plan = await this.aiProvider.generatePlan(analysis);
    this.db.saveTestPlan(plan);
    return plan;
  }

  /**
   * Autonomous Agent Execution Loop
   * Contract: executeAgentLoop(runId, abortSignal): Promise<RunResult>
   */
  public async executeAgentLoop(
    runId: string,
    externalSignal?: AbortSignal,
    options?: {
      targetUrl?: string;
      maxSteps?: number;
      taskId?: string;
      authorizationId?: string;
    }
  ): Promise<RunResult> {
    const startTime = Date.now();
    const abortController = new AbortController();
    this.activeAbortControllers.set(runId, abortController);

    // Merge external abort signal if provided
    if (externalSignal) {
      externalSignal.addEventListener('abort', () => abortController.abort());
    }

    const taskId = options?.taskId || `task_${Date.now()}`;
    const targetUrl = options?.targetUrl || 'http://localhost:4173';
    const maxSteps = options?.maxSteps || 10;

    let totalStepsExecuted = 0;
    let passedSteps = 0;
    let failedSteps = 0;
    let candidateBugsFound: CandidateBug[] = [];
    let evidenceCollected: EvidenceRecord[] = [];
    let activeBrowserSession: any = null;
    let activePage: any = null;

    try {
      // 1. Fetch task and plan
      let task = this.db.getTask(taskId);
      if (!task) {
        // Auto-create task if not already present
        const analysis = await this.analyzeTask({
          id: taskId,
          title: 'Automated Cart & Product Flow Verification',
          description: `Verify Shopping Cart functionality on ${targetUrl}. Do not submit checkout payments.`,
          targetUrl
        });
        task = this.db.getTask(taskId)!;
      }

      let testPlan = this.db.getTestPlanForTask(taskId);
      if (!testPlan) {
        testPlan = await this.generateTestPlan(task.analysis!);
      }

      // Persist agent run record
      this.db.saveRun({
        id: runId,
        taskId,
        status: 'RUNNING',
        mode: 'AUTHORIZED_AUTO_MODE',
        startTime: new Date().toISOString()
      });

      // 2. Fetch or create authorization record for target domain
      const parsedUrl = new URL(targetUrl);
      const targetDomain = parsedUrl.hostname;

      let auth = options?.authorizationId
        ? this.db.getAuthorization(options.authorizationId)
        : null;

      if (!auth) {
        auth = {
          id: `auth_${Date.now()}`,
          grantingOrgOrPerson: 'Test IO Authorized QA Operator',
          verificationEvidence: 'Local Demo Lab Environment Test Grant',
          scope: 'Automated web exploratory and regression testing',
          allowedDomains: ['localhost', '127.0.0.1', targetDomain],
          allowedActions: ['NAVIGATE', 'CLICK', 'FILL', 'SELECT', 'SCROLL', 'CAPTURE', 'FINISH'],
          allowedDeviceTypes: ['Desktop'],
          startTime: new Date(Date.now() - 3600000).toISOString(),
          expirationTime: new Date(Date.now() + 86400000).toISOString(),
          isRevoked: false,
          createdAt: new Date().toISOString()
        };
        this.db.saveAuthorization(auth);
      }

      const actionContext: ActionContext = {
        sourcePlatform: 'TEST_IO_STUDIO',
        destinationDomain: targetDomain,
        targetDevice: 'Desktop Chrome / Windows 11',
        authorization: auth,
        executionMode: 'AUTHORIZED_AUTO_MODE'
      };

      // 3. Initialize Browser Session
      activeBrowserSession = await this.browserManager.createBrowserSession(
        { headless: true },
        auth
      );

      // Open initial authorized tab
      activePage = await this.browserManager.openAuthorizedTab(
        activeBrowserSession.sessionId,
        targetUrl
      );

      this.auditLogger.record(
        'openAuthorizedTab',
        `Opened authorized tab for ${targetUrl}`,
        'ALLOW',
        'SUCCESS',
        { taskId, runId, targetDomain }
      );

      // 4. Observation - Action - Verification Loop
      for (let stepIndex = 0; stepIndex < testPlan.steps.length && stepIndex < maxSteps; stepIndex++) {
        if (abortController.signal.aborted) {
          throw new Error('Agent execution cancelled via AbortSignal');
        }

        const step = testPlan.steps[stepIndex];
        totalStepsExecuted++;

        // A. Observe
        const observation = await this.browserManager.inspectWebPage(activePage.pageId);

        // B. Choose Action
        const action = await this.aiProvider.chooseAction(observation, testPlan, stepIndex);

        // C. Check Permission Guard
        const permDecision = checkActionPermission(actionContext, {
          type: action.type,
          domain: targetDomain,
          target: action.selector || action.url
        });

        if (permDecision.status !== 'ALLOW') {
          this.auditLogger.record(
            `executeBrowserAction:${action.type}`,
            `Blocked action by permission guard: ${permDecision.reason}`,
            permDecision.status,
            'DENIED',
            { taskId, runId, targetDomain }
          );
          failedSteps++;
          continue;
        }

        // D. Execute Action
        const actionResult = await this.browserManager.executeBrowserAction(
          activePage.pageId,
          action,
          permDecision
        );

        this.auditLogger.record(
          `executeBrowserAction:${action.type}`,
          actionResult.actionSummary,
          'ALLOW',
          actionResult.success ? 'SUCCESS' : 'FAILED',
          { taskId, runId, targetDomain }
        );

        // E. Postcondition Verification & Evidence Capture
        const postObservation = await this.browserManager.inspectWebPage(activePage.pageId);

        // Capture screenshot evidence
        const screenshotBuf = await this.browserManager.capturePageScreenshot(activePage.pageId);
        const evidence = await this.evidenceService.captureEvidence(runId, {
          type: 'SCREENSHOT',
          content: screenshotBuf,
          stepId: step.stepId,
          filenamePrefix: `step_${step.stepNumber}`
        });
        evidenceCollected.push(evidence);

        // Evaluate expectation & detect potential bug
        // For Cart verification: Check if subtotal matches 29.99 + 49.99 = 79.98
        const expectation = {
          numericCalculation: step.goal.toLowerCase().includes('total')
            ? { expected: 79.98 }
            : undefined,
          expectedText: step.expectedBehavior
        };

        const bug = detectCandidateBug(postObservation, expectation, { runId, stepId: step.stepId });
        if (bug) {
          bug.evidenceIds.push(evidence.id);
          this.db.saveCandidateBug(bug);
          candidateBugsFound.push(bug);

          // Verify candidate bug
          await verifyCandidateBug(bug);
          failedSteps++;
        } else {
          passedSteps++;
        }
      }

      // 5. Generate Report Draft
      let report: ReportDraft | undefined;
      if (candidateBugsFound.length > 0) {
        report = await generateReportDraft({
          taskId,
          runId,
          candidateBug: candidateBugsFound[0],
          evidenceRecords: evidenceCollected,
          stepsToReproduce: testPlan.steps.map((s, idx) => `${idx + 1}. ${s.goal}`)
        });
        this.db.saveReportDraft(report);
      }

      // Update task status in DB
      task.status = 'COMPLETED';
      task.updatedAt = new Date().toISOString();
      this.db.saveTask(task);

      this.db.updateRun({
        id: runId,
        status: 'COMPLETED',
        totalSteps: totalStepsExecuted,
        passedSteps,
        failedSteps,
        bugsFound: candidateBugsFound.length,
        endTime: new Date().toISOString()
      });

      return {
        runId,
        taskId,
        finalStatus: 'COMPLETED',
        totalStepsExecuted,
        passedSteps,
        failedSteps,
        bugsFound: candidateBugsFound.length,
        durationMs: Date.now() - startTime,
        reportId: report?.id
      };
    } catch (err: any) {
      return {
        runId,
        taskId,
        finalStatus: abortController.signal.aborted ? 'CANCELLED' : 'FAILED',
        totalStepsExecuted,
        passedSteps,
        failedSteps,
        bugsFound: candidateBugsFound.length,
        durationMs: Date.now() - startTime,
        error: err?.message || String(err)
      };
    } finally {
      if (activeBrowserSession) {
        await this.browserManager.closeSession(activeBrowserSession.sessionId).catch(() => {});
      }
      this.activeAbortControllers.delete(runId);
    }
  }

  /**
   * Emergency Stop
   * Contract: emergencyStop(runId): Promise<StopResult>
   */
  public async emergencyStop(runId: string): Promise<StopResult> {
    const controller = this.activeAbortControllers.get(runId);
    const released: string[] = [];

    if (controller) {
      controller.abort();
      released.push(`AbortController fired for run ${runId}`);
    }

    // Force close any stray browser sessions
    await this.browserManager.closeAll().catch(() => {});
    released.push('Closed all active Playwright browser sessions');

    this.auditLogger.record(
      'emergencyStop',
      `Emergency stop triggered for run ${runId}`,
      'ALLOW',
      'SUCCESS',
      { runId }
    );

    return {
      runId,
      stopped: true,
      reason: 'Emergency Stop requested by user.',
      releasedResources: released
    };
  }
}

export function createOrchestrator(db: AgentStudioDatabase): AgentOrchestrator {
  return new AgentOrchestrator(db);
}
