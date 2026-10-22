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
  ReportDraft,
  AuthorizationRecord,
  StateExpectation
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
import { AiRuntimeManager } from './ai_runtime_manager.js';

export interface ActiveRunState {
  runId: string;
  taskId: string;
  status: 'RUNNING' | 'PAUSED' | 'CANCELLED' | 'COMPLETED' | 'FAILED';
  currentStep: number;
  totalSteps: number;
  activeStepGoal?: string;
  targetUrl: string;
  isPaused: boolean;
  pausePromiseResolve?: () => void;
  abortController: AbortController;
  activeBrowserSessionId?: string;
  latestScreenshotBase64?: string;
  logs: string[];
  candidateBugs: CandidateBug[];
  evidence: EvidenceRecord[];
  error?: string;
}

export class AgentOrchestrator {
  private runtimeManager: AiRuntimeManager;
  private auditLogger: AuditLogService;
  private evidenceService: EvidenceService;
  private activeAbortControllers = new Map<string, AbortController>();
  private activeRuns = new Map<string, ActiveRunState>();

  constructor(
    private db: AgentStudioDatabase,
    private browserManager: BrowserSessionManager = browserSessionManager,
    providerType: string | AiRuntimeManager = 'deterministic',
    providerConfig?: any
  ) {
    if (providerType instanceof AiRuntimeManager) {
      this.runtimeManager = providerType;
    } else {
      this.runtimeManager = new AiRuntimeManager(undefined, providerType, providerConfig);
    }
    this.auditLogger = new AuditLogService(db);
    this.evidenceService = new EvidenceService(db);
  }

  public setRuntimeManager(manager: AiRuntimeManager): void {
    this.runtimeManager = manager;
  }

  public getRuntimeManager(): AiRuntimeManager {
    return this.runtimeManager;
  }

  public setAiProvider(providerType: string, config?: any): void {
    this.runtimeManager.setProvider(providerType as any, config);
  }

  public getActiveAiProviderName(): string {
    return this.runtimeManager.getActiveProvider().name;
  }

  public getActiveAiRuntimeStatus() {
    return this.runtimeManager.getActiveAiRuntimeStatus();
  }

  public async syncAiRuntimeWithSettings(): Promise<void> {
    await this.runtimeManager.syncWithSettings();
  }

  public getRunState(runId: string): ActiveRunState | null {
    const active = this.activeRuns.get(runId);
    if (active) return { ...active };

    // Fallback to DB
    const dbRun = this.db.getRun(runId);
    if (!dbRun) return null;

    const task = this.db.getTask(dbRun.taskId);
    const bugs = this.db.listCandidateBugs(runId);
    const evidence = this.db.listEvidence(runId);

    return {
      runId: dbRun.id,
      taskId: dbRun.taskId,
      status: dbRun.status as any,
      currentStep: dbRun.passedSteps + dbRun.failedSteps,
      totalSteps: dbRun.totalSteps,
      targetUrl: task?.targetUrl || 'http://127.0.0.1:4173',
      isPaused: dbRun.status === 'PAUSED',
      abortController: new AbortController(),
      logs: [],
      candidateBugs: bugs,
      evidence
    };
  }

  public getRunLogs(runId: string): string[] {
    const active = this.activeRuns.get(runId);
    if (active) return [...active.logs];
    return this.db.listAuditLogs(50)
      .filter((l) => l.runId === runId)
      .map((l) => `[${l.timestamp}] [${l.toolName}] ${l.actionSummary} -> ${l.outcome}`);
  }

  public async pauseRun(runId: string): Promise<boolean> {
    const run = this.activeRuns.get(runId);
    if (!run || run.status !== 'RUNNING') return false;

    run.isPaused = true;
    run.status = 'PAUSED';
    run.logs.push(`[${new Date().toLocaleTimeString()}] PAUSE: Agent execution paused by user.`);
    this.db.updateRun({
      id: runId,
      status: 'PAUSED',
      totalSteps: run.totalSteps,
      passedSteps: run.currentStep,
      failedSteps: run.candidateBugs.length,
      bugsFound: run.candidateBugs.length,
      endTime: ''
    });
    return true;
  }

  public async resumeRun(runId: string): Promise<boolean> {
    const run = this.activeRuns.get(runId);
    if (!run || run.status !== 'PAUSED') return false;

    // Verify authorization is still active before resuming
    const parsed = new URL(run.targetUrl);
    const domain = parsed.hostname.toLowerCase();
    const auth = this.db.findAuthorizationForDomain(domain);
    if (!auth || auth.isRevoked || new Date() > new Date(auth.expirationTime)) {
      throw new Error(`Cannot resume run: authorization for domain '${domain}' has expired or is revoked.`);
    }

    run.isPaused = false;
    run.status = 'RUNNING';
    run.logs.push(`[${new Date().toLocaleTimeString()}] RESUME: Agent execution resumed.`);
    this.db.updateRun({
      id: runId,
      status: 'RUNNING',
      totalSteps: run.totalSteps,
      passedSteps: run.currentStep,
      failedSteps: run.candidateBugs.length,
      bugsFound: run.candidateBugs.length,
      endTime: ''
    });

    if (run.pausePromiseResolve) {
      run.pausePromiseResolve();
      run.pausePromiseResolve = undefined;
    }
    return true;
  }

  /**
   * Analyze Task input and detect scope, requirements and missing info
   * Contract: analyzeTask(input): Promise<TaskAnalysis>
   */
  public async analyzeTask(input: TaskInput): Promise<TaskAnalysis> {
    await this.runtimeManager.syncWithSettings();
    const provider = this.runtimeManager.getActiveProvider();
    const modelId = this.runtimeManager.getActiveConfig().modelId;

    const analysis = await provider.analyzeTask({
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
  public async generateTestPlan(analysis?: TaskAnalysis): Promise<TestPlan> {
    await this.runtimeManager.syncWithSettings();
    const provider = this.runtimeManager.getActiveProvider();
    const safeAnalysis: TaskAnalysis = analysis || {
      taskId: `task_${Date.now()}`,
      taskType: 'EXPLORATORY',
      targetApplication: 'Web Application',
      authorizedDomains: ['localhost', '127.0.0.1'],
      inScopeFeatures: ['Shopping Cart', 'Navigation'],
      outOfScopeFeatures: ['Checkout Payment'],
      requirements: ['Verify shopping cart functional flow'],
      requiredDevice: 'Desktop Chrome',
      reportingRequirements: ['Steps to reproduce', 'Expected result', 'Actual result', 'Evidence screenshot'],
      riskLevel: 'LOW',
      missingInformation: [],
      confidenceScore: 0.95
    };
    const plan = await provider.generatePlan(safeAnalysis);
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
    const targetUrl = options?.targetUrl || 'http://127.0.0.1:4173';
    const maxSteps = options?.maxSteps || 10;

    let totalStepsExecuted = 0;
    let passedSteps = 0;
    let failedSteps = 0;
    let candidateBugsFound: CandidateBug[] = [];
    let evidenceCollected: EvidenceRecord[] = [];
    let activeBrowserSession: any = null;
    let activePage: any = null;

    const runState: ActiveRunState = {
      runId,
      taskId,
      status: 'RUNNING',
      currentStep: 0,
      totalSteps: 4,
      targetUrl,
      isPaused: false,
      abortController,
      logs: [`[${new Date().toLocaleTimeString()}] Initializing autonomous agent for ${targetUrl}...`],
      candidateBugs: [],
      evidence: []
    };
    this.activeRuns.set(runId, runState);

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

      // If task exists but was not analyzed yet (e.g. seeded demo task), analyze it now
      if (!task.analysis) {
        task.analysis = await this.analyzeTask({
          id: task.id,
          title: task.title,
          description: task.description,
          targetUrl: task.targetUrl || targetUrl,
          targetApp: task.targetApp
        });
      }

      let testPlan = this.db.getTestPlanForTask(taskId);
      if (!testPlan) {
        testPlan = await this.generateTestPlan(task.analysis);
      }
      runState.totalSteps = testPlan.steps.length;

      // Persist agent run record
      this.db.saveRun({
        id: runId,
        taskId,
        status: 'RUNNING',
        mode: 'AUTHORIZED_AUTO_MODE',
        startTime: new Date().toISOString()
      });

      // 2. Strict Authorization Verification
      const parsedUrl = new URL(targetUrl);
      const targetDomain = parsedUrl.hostname.toLowerCase();

      // BLOCK tester.test.io unconditionally from automated browsing
      if (targetDomain === 'tester.test.io' || targetDomain.endsWith('.test.io')) {
        throw new Error(
          `SECURITY POLICY VIOLATION: Autonomous browser automation on Test IO platform '${targetDomain}' is strictly prohibited. Use manual Test IO assistant mode.`
        );
      }

      let auth: AuthorizationRecord | null = null;
      if (options?.authorizationId) {
        auth = this.db.getAuthorization(options.authorizationId);
      }

      if (!auth) {
        auth = this.db.findAuthorizationForDomain(targetDomain);
      }

      // Check if this is the owned local demo testing lab
      if (!auth && (targetDomain === 'localhost' || targetDomain === '127.0.0.1')) {
        this.db.seedDemoAuthorizationIfMissing();
        auth = this.db.findAuthorizationForDomain(targetDomain);
      }

      // FOR ANY TARGET: Authorization must be independently verified and stored!
      if (!auth) {
        throw new Error(
          `AUTHORIZATION_REQUIRED: No valid, active AuthorizationRecord exists for domain '${targetDomain}'. Autonomous testing requires an explicit authorization grant.`
        );
      }

      if (auth.isRevoked) {
        throw new Error(`AUTHORIZATION_REVOKED: Authorization grant '${auth.id}' for domain '${targetDomain}' has been revoked.`);
      }

      if (new Date() > new Date(auth.expirationTime)) {
        throw new Error(`AUTHORIZATION_EXPIRED: Authorization grant '${auth.id}' for domain '${targetDomain}' expired on ${auth.expirationTime}.`);
      }

      const actionContext: ActionContext = {
        sourcePlatform: 'TEST_IO_STUDIO',
        destinationDomain: targetDomain,
        targetDevice: 'Desktop Chrome / Windows 11',
        authorization: auth,
        executionMode: 'AUTHORIZED_AUTO_MODE'
      };

      runState.logs.push(`[${new Date().toLocaleTimeString()}] Authorization verified: Grant '${auth.id}' by '${auth.grantingOrgOrPerson}'.`);

      // Bind and lock reasoning engine for this run
      const runProvider = this.runtimeManager.getProviderForRun(runId);
      const runModelId = this.runtimeManager.getModelIdForRun(runId);
      runState.logs.push(`[${new Date().toLocaleTimeString()}] Reasoning Engine bound: ${runProvider.name} (Model: ${runModelId})`);

      // 3. Initialize Browser Session
      activeBrowserSession = await this.browserManager.createBrowserSession(
        { headless: true },
        auth
      );
      runState.activeBrowserSessionId = activeBrowserSession.sessionId;

      // Open initial authorized tab
      activePage = await this.browserManager.openAuthorizedTab(
        activeBrowserSession.sessionId,
        targetUrl
      );

      // Initial screenshot
      const initialScreenshot = await this.browserManager.capturePageScreenshot(activePage.pageId);
      runState.latestScreenshotBase64 = initialScreenshot.toString('base64');

      this.auditLogger.record(
        'openAuthorizedTab',
        `Opened authorized tab for ${targetUrl}`,
        'ALLOW',
        'SUCCESS',
        { taskId, runId, targetDomain }
      );
      runState.logs.push(`[${new Date().toLocaleTimeString()}] Opened authorized browser tab for ${targetUrl}`);

      // 4. Observation - Action - Verification Loop
      for (let stepIndex = 0; stepIndex < testPlan.steps.length && stepIndex < maxSteps; stepIndex++) {
        // Pause handling: Wait if execution is paused
        if (runState.isPaused) {
          runState.logs.push(`[${new Date().toLocaleTimeString()}] Paused at step ${stepIndex + 1}. Waiting for user resume...`);
          await new Promise<void>((resolve) => {
            runState.pausePromiseResolve = resolve;
          });
        }

        if (abortController.signal.aborted) {
          throw new Error('Agent execution cancelled via AbortSignal');
        }

        const step = testPlan.steps[stepIndex];
        totalStepsExecuted++;
        runState.currentStep = stepIndex + 1;
        runState.activeStepGoal = step.goal;

        runState.logs.push(`[${new Date().toLocaleTimeString()}] Step ${step.stepNumber}/${testPlan.steps.length}: ${step.goal}`);

        // A. Observe
        const observation = await this.browserManager.inspectWebPage(activePage.pageId);

        // B. Choose Action via configured AI Provider
        const action = await runProvider.chooseAction(observation, testPlan, stepIndex);

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
          runState.logs.push(`[${new Date().toLocaleTimeString()}] BLOCKED: ${permDecision.reason}`);
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
        runState.logs.push(`[${new Date().toLocaleTimeString()}] Executed: ${actionResult.actionSummary}`);

        // E. Postcondition Verification & Evidence Capture
        const postObservation = await this.browserManager.inspectWebPage(activePage.pageId);

        // Capture screenshot evidence
        const screenshotBuf = await this.browserManager.capturePageScreenshot(activePage.pageId);
        runState.latestScreenshotBase64 = screenshotBuf.toString('base64');

        const evidence = await this.evidenceService.captureEvidence(runId, {
          type: 'SCREENSHOT',
          content: screenshotBuf,
          stepId: step.stepId,
          filenamePrefix: `step_${step.stepNumber}`
        });
        evidenceCollected.push(evidence);
        runState.evidence.push(evidence);

        // Evaluate expectation using AI Provider & Test Intelligence
        const isCartCalculationStep = 
          step.verificationMethod === 'NUMERIC_CALCULATION' ||
          step.goal.toLowerCase().includes('total') || 
          step.expectedBehavior.toLowerCase().includes('79.98');

        const expectation: StateExpectation = {
          numericCalculation: isCartCalculationStep ? { expected: 79.98 } : undefined,
          elementState: step.targetSelector ? { selector: step.targetSelector, shouldBeVisible: true } : undefined
        };

        const verification = await runProvider.evaluateVerification(postObservation, expectation);

        // Check for bug detection
        let bug: CandidateBug | null = null;
        if (isCartCalculationStep) {
          bug = detectCandidateBug(postObservation, expectation, { runId, stepId: step.stepId });
        } else if (!verification.passed) {
          bug = detectCandidateBug(postObservation, expectation, { runId, stepId: step.stepId });
        }

        if (bug) {
          bug.evidenceIds.push(evidence.id);
          this.db.saveCandidateBug(bug);
          candidateBugsFound.push(bug);
          runState.candidateBugs.push(bug);

          runState.logs.push(`[${new Date().toLocaleTimeString()}] BUG DETECTED: ${bug.title} (Actual: ${bug.actualResult})`);
          await verifyCandidateBug(bug);
          failedSteps++;
        } else {
          runState.logs.push(`[${new Date().toLocaleTimeString()}] VERIFIED: Step ${step.stepNumber} passed.`);
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
        runState.logs.push(`[${new Date().toLocaleTimeString()}] Bug Report Draft generated: '${report.title}'`);
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

      runState.status = 'COMPLETED';
      runState.logs.push(`[${new Date().toLocaleTimeString()}] Test run completed. Passed: ${passedSteps}, Bugs: ${candidateBugsFound.length}`);

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
      runState.status = abortController.signal.aborted ? 'CANCELLED' : 'FAILED';
      runState.error = err?.message || String(err);
      runState.logs.push(`[${new Date().toLocaleTimeString()}] Run stopped with status ${runState.status}: ${runState.error}`);

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
      this.runtimeManager.releaseRunLock(runId);
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

    const activeRun = this.activeRuns.get(runId);
    if (activeRun) {
      activeRun.status = 'CANCELLED';
      activeRun.logs.push(`[${new Date().toLocaleTimeString()}] EMERGENCY STOP requested.`);
      if (activeRun.pausePromiseResolve) {
        activeRun.pausePromiseResolve();
      }
    }

    if (controller) {
      controller.abort();
      released.push(`AbortController fired for run ${runId}`);
    }

    // Force close any active Playwright browser sessions
    await this.browserManager.closeAll().catch(() => {});
    released.push('Closed all active Playwright browser sessions');

    this.auditLogger.record(
      'emergencyStop',
      `Emergency stop triggered for run ${runId}`,
      'ALLOW',
      'SUCCESS',
      { runId }
    );

    this.db.updateRun({
      id: runId,
      status: 'CANCELLED',
      totalSteps: activeRun?.totalSteps || 0,
      passedSteps: activeRun?.currentStep || 0,
      failedSteps: 0,
      bugsFound: activeRun?.candidateBugs.length || 0,
      endTime: new Date().toISOString()
    });

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
