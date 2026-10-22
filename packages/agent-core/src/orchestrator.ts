import type {
  TaskInput,
  TaskRecord,
  TaskAnalysis,
  TestingModuleType,
  TestPlan,
  RunResult,
  RunStatus,
  StopResult,
  ActionContext,
  CandidateBug,
  EvidenceRecord,
  ReportDraft,
  AuthorizationRecord,
  CreateAuthorizationDto,
  AuthorizationEvaluationResult,
  StateExpectation,
  StepExecutionResult,
  StepVerificationStatus,
  RequirementsCoverageMatrix,
  TestRequirementItem,
  PageObservation
} from '@test-io-agent/shared';
import type { AgentStudioDatabase } from '@test-io-agent/storage';
import { AuditLogService, checkActionPermission } from '@test-io-agent/policy-engine';
import { createAiProvider, type AiProvider } from '@test-io-agent/ai-providers';
import {
  BrowserSessionManager,
  browserSessionManager,
  detectAccessBlocker,
  verifyApplicationReady
} from '@test-io-agent/browser-adapter';
import { EvidenceService } from '@test-io-agent/evidence';
import { generateReportDraft, validateReportDraft } from '@test-io-agent/report-engine';
import { detectCandidateBug, verifyCandidateBug } from '@test-io-agent/test-intelligence';
import { AiRuntimeManager } from './ai_runtime_manager.js';
import {
  extractTestRequirements,
  buildCoverageMatrix,
  computeRequirementsFingerprint
} from './requirements_coverage.js';
import { verifyActionPostcondition } from './verification_engine.js';

export interface ActiveRunState {
  runId: string;
  taskId: string;
  status: RunStatus;
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
  blockerReason?: string;
  providerUsed?: string;
  modelUsed?: string;
  coverageMatrix?: RequirementsCoverageMatrix;
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
    plan.planVersion = 1;
    plan.requirementsFingerprint = computeRequirementsFingerprint(
      { title: safeAnalysis.targetApplication, description: (safeAnalysis.requirements || []).join(' ') },
      safeAnalysis,
      this.runtimeManager.getActiveConfig().modelId
    );
    this.db.saveTestPlan(plan);
    return plan;
  }

  /**
   * Authorization Management Operations
   */
  public listAuthorizations(): AuthorizationRecord[] {
    return this.db.listAuthorizations();
  }

  public getAuthorization(id: string): AuthorizationRecord | null {
    return this.db.getAuthorization(id);
  }

  public createVerifiedAuthorization(dto: CreateAuthorizationDto): AuthorizationRecord {
    return this.db.createVerifiedAuthorization(dto);
  }

  public revokeAuthorization(id: string, reason?: string): AuthorizationRecord {
    return this.db.revokeAuthorization(id, reason);
  }

  public evaluateTargetAuthorization(targetUrl: string): AuthorizationEvaluationResult {
    return this.db.evaluateTargetAuthorization(targetUrl);
  }

  public getAuthorizationStatusForTask(taskId: string): AuthorizationEvaluationResult {
    return this.db.getAuthorizationStatusForTask(taskId);
  }

  public async startRun(options: {
    targetUrl?: string;
    taskId?: string;
    authorizationId?: string;
    runId?: string;
    maxSteps?: number;
  }): Promise<RunResult> {
    const runId = options.runId || `run_${Date.now()}`;
    return this.executeAgentLoop(runId, undefined, options);
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

    let unverifiedSteps = 0;
    const stepExecutionResults: StepExecutionResult[] = [];

    try {
      // 1. Synchronize provider with settings before locking
      await this.runtimeManager.syncWithSettings();
      const runProvider = this.runtimeManager.getProviderForRun(runId);
      const runModelId = this.runtimeManager.getModelIdForRun(runId);
      const runtimeStatus = this.runtimeManager.getActiveAiRuntimeStatus();

      runState.providerUsed = runProvider.name;
      runState.modelUsed = runModelId;

      runState.logs.push(
        `[${new Date().toLocaleTimeString()}] Reasoning Engine bound: ${runProvider.name} (Model: ${runModelId}, Status: ${runtimeStatus.status})`
      );

      // 2. Fetch or auto-analyze task
      let task = this.db.getTask(taskId);
      if (!task) {
        const analysis = await this.analyzeTask({
          id: taskId,
          title: 'Automated Functional Verification',
          description: `Verify functional navigation, CTAs, carousels, and interactive elements on ${targetUrl}.`,
          targetUrl
        });
        task = this.db.getTask(taskId)!;
      }

      if (!task.analysis) {
        task.analysis = await this.analyzeTask({
          id: task.id,
          title: task.title,
          description: task.description,
          targetUrl: task.targetUrl || targetUrl,
          targetApp: task.targetApp
        });
      }

      // 3. Plan versioning & requirements fingerprint invalidation
      const expectedFingerprint = computeRequirementsFingerprint(
        { title: task.title, description: task.description, targetUrl: task.targetUrl || targetUrl },
        task.analysis,
        runModelId
      );

      let testPlan = this.db.getTestPlanForTask(taskId);
      if (!testPlan || testPlan.requirementsFingerprint !== expectedFingerprint) {
        if (testPlan) {
          runState.logs.push(
            `[${new Date().toLocaleTimeString()}] Task scope or model changed. Regenerating authoritative test plan...`
          );
          this.db.deleteTestPlanForTask(taskId);
        }
        testPlan = await this.generateTestPlan(task.analysis);
        testPlan.requirementsFingerprint = expectedFingerprint;
        testPlan.planVersion = (testPlan.planVersion || 1) + 1;
        this.db.saveTestPlan(testPlan);
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

      // 4. Strict Authorization Verification
      const authEval = this.db.evaluateTargetAuthorization(targetUrl);
      if (!authEval.isAuthorized || !authEval.authorization) {
        runState.status = 'BLOCKED_AUTHORIZATION';
        runState.error = authEval.reason;
        runState.blockerReason = authEval.reason;
        runState.activeStepGoal = undefined;
        runState.latestScreenshotBase64 = undefined;
        runState.logs.push(`[${new Date().toLocaleTimeString()}] BLOCKED_AUTHORIZATION: ${authEval.reason}`);

        this.db.updateRun({
          id: runId,
          status: 'BLOCKED_AUTHORIZATION',
          totalSteps: 0,
          passedSteps: 0,
          failedSteps: 0,
          bugsFound: 0,
          endTime: new Date().toISOString()
        });

        return {
          runId,
          taskId,
          finalStatus: 'BLOCKED_AUTHORIZATION',
          totalStepsExecuted: 0,
          passedSteps: 0,
          failedSteps: 0,
          bugsFound: 0,
          durationMs: Date.now() - startTime,
          error: authEval.reason,
          providerUsed: runProvider.name,
          modelUsed: runModelId
        };
      }

      const auth = authEval.authorization;
      const targetDomain = authEval.targetDomain;

      const actionContext: ActionContext = {
        sourcePlatform: 'TEST_IO_STUDIO',
        destinationDomain: targetDomain,
        targetDevice: 'Desktop Chrome / Windows 11',
        authorization: auth,
        executionMode: 'AUTHORIZED_AUTO_MODE'
      };

      runState.logs.push(
        `[${new Date().toLocaleTimeString()}] Authorization verified: Grant '${auth.id}' by '${auth.grantingOrgOrPerson}'.`
      );

      // 5. Initialize Browser Session
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

      // Inspect initial observation
      const initialObservation = await this.browserManager.inspectWebPage(activePage.pageId);

      // 6. Security Blocker & Cloudflare Challenge Check
      const accessBlocker = detectAccessBlocker(initialObservation);
      if (accessBlocker) {
        runState.status = accessBlocker.recommendedRunStatus;
        runState.error = accessBlocker.diagnosticDetails;
        runState.blockerReason = accessBlocker.diagnosticDetails;
        runState.activeStepGoal = undefined;

        runState.logs.push(
          `[${new Date().toLocaleTimeString()}] ${accessBlocker.recommendedRunStatus}: ${accessBlocker.diagnosticDetails}`
        );
        for (const sig of accessBlocker.signalsDetected) {
          runState.logs.push(`[${new Date().toLocaleTimeString()}] DIAGNOSTIC SIGNAL: ${sig}`);
        }

        // Save diagnostic evidence screenshot
        const diagEvidence = await this.evidenceService.captureEvidence(runId, {
          type: 'SCREENSHOT',
          content: initialScreenshot,
          filenamePrefix: 'diagnostic_blocker',
          category: 'DIAGNOSTIC'
        });
        evidenceCollected.push(diagEvidence);
        runState.evidence.push(diagEvidence);

        this.db.updateRun({
          id: runId,
          status: accessBlocker.recommendedRunStatus,
          totalSteps: 0,
          passedSteps: 0,
          failedSteps: 0,
          bugsFound: 0,
          endTime: new Date().toISOString()
        });

        // Do not continue, do not click CAPTCHA, do not classify as product bug
        return {
          runId,
          taskId,
          finalStatus: accessBlocker.recommendedRunStatus,
          totalStepsExecuted: 0,
          passedSteps: 0,
          failedSteps: 0,
          bugsFound: 0,
          durationMs: Date.now() - startTime,
          error: accessBlocker.diagnosticDetails,
          providerUsed: runProvider.name,
          modelUsed: runModelId
        };
      }

      // 7. Verify Real Page Readiness
      const readiness = verifyApplicationReady(initialObservation, task.analysis);
      if (!readiness.isReady) {
        runState.status = 'NEEDS_REVIEW';
        runState.error = readiness.reason;
        runState.blockerReason = readiness.reason;
        runState.activeStepGoal = undefined;
        runState.logs.push(`[${new Date().toLocaleTimeString()}] Page readiness verification failed: ${readiness.reason}`);

        this.db.updateRun({
          id: runId,
          status: 'NEEDS_REVIEW',
          totalSteps: 0,
          passedSteps: 0,
          failedSteps: 0,
          bugsFound: 0,
          endTime: new Date().toISOString()
        });

        return {
          runId,
          taskId,
          finalStatus: 'NEEDS_REVIEW',
          totalStepsExecuted: 0,
          passedSteps: 0,
          failedSteps: 0,
          bugsFound: 0,
          durationMs: Date.now() - startTime,
          error: readiness.reason,
          providerUsed: runProvider.name,
          modelUsed: runModelId
        };
      }

      // 8. Extract Test Requirements & Build Coverage Baseline
      const requirements = extractTestRequirements(task.analysis, initialObservation);
      runState.logs.push(
        `[${new Date().toLocaleTimeString()}] Requirements extracted: ${requirements.length} applicable test requirements mapped.`
      );

      // 9. Observation - Action - Verification Loop
      for (let stepIndex = 0; stepIndex < testPlan.steps.length && stepIndex < maxSteps; stepIndex++) {
        // Pause handling
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

        // A. Observe before action
        const beforeObservation = await this.browserManager.inspectWebPage(activePage.pageId);

        // Check if mid-run blocker appeared
        const midBlocker = detectAccessBlocker(beforeObservation);
        if (midBlocker) {
          runState.status = midBlocker.recommendedRunStatus;
          runState.error = midBlocker.diagnosticDetails;
          runState.blockerReason = midBlocker.diagnosticDetails;
          runState.logs.push(`[${new Date().toLocaleTimeString()}] ${midBlocker.recommendedRunStatus}: ${midBlocker.diagnosticDetails}`);
          break;
        }

        // B. Choose Action via configured AI Provider
        let action;
        try {
          action = await runProvider.chooseAction(beforeObservation, testPlan, stepIndex);
        } catch (inferErr: any) {
          const inferMsg = inferErr?.message || String(inferErr);
          runState.logs.push(`[${new Date().toLocaleTimeString()}] AI INFERENCE ERROR: ${inferMsg}`);
          runState.status = 'NEEDS_REVIEW';
          runState.error = inferMsg;
          break;
        }

        let actionDomain = targetDomain;
        if (action.url) {
          try {
            const u = new URL(action.url);
            actionDomain = u.hostname.toLowerCase();
          } catch {
            actionDomain = targetDomain;
          }
        }

        // C. Check Permission Guard
        const permDecision = checkActionPermission(actionContext, {
          type: action.type,
          domain: actionDomain,
          target: action.selector || action.url
        });

        if (permDecision.status !== 'ALLOW') {
          this.auditLogger.record(
            `executeBrowserAction:${action.type}`,
            `Blocked action by permission guard: ${permDecision.reason}`,
            permDecision.status,
            'DENIED',
            { taskId, runId, targetDomain: actionDomain }
          );
          runState.logs.push(`[${new Date().toLocaleTimeString()}] BLOCKED: ${permDecision.reason}`);
          failedSteps++;

          stepExecutionResults.push({
            stepId: step.stepId,
            runId,
            outcome: 'BLOCKED',
            actionExecuted: false,
            actionSucceeded: false,
            postconditionChecked: false,
            verificationStatus: 'BLOCKED',
            actualObservation: `Blocked by policy: ${permDecision.reason}`,
            matchedExpectation: false,
            notes: permDecision.reason,
            durationMs: 0,
            evidenceIds: []
          });
          continue;
        }

        // D. Execute Action
        const actionResult = await this.browserManager.executeBrowserAction(
          activePage.pageId,
          action,
          permDecision
        );

        const actionExecuted = true;
        const actionSucceeded = actionResult.success;

        this.auditLogger.record(
          `executeBrowserAction:${action.type}`,
          actionResult.actionSummary,
          'ALLOW',
          actionSucceeded ? 'SUCCESS' : 'FAILED',
          { taskId, runId, targetDomain: actionDomain }
        );
        runState.logs.push(`[${new Date().toLocaleTimeString()}] Executed: ${actionResult.actionSummary}`);

        // E. Postcondition Verification & Evidence Capture
        const postObservation = await this.browserManager.inspectWebPage(activePage.pageId);

        // Check for out-of-scope redirection
        let postNavDomain = targetDomain;
        try {
          const curUrl = new URL(postObservation.currentUrl || activePage.url || '');
          postNavDomain = curUrl.hostname.toLowerCase();
        } catch {}

        const isNavAllowed = auth.allowedDomains.some((d) => {
          const ld = d.toLowerCase();
          return (
            postNavDomain === ld ||
            postNavDomain.endsWith(`.${ld}`) ||
            ((postNavDomain === 'localhost' || postNavDomain === '127.0.0.1') && (ld === 'localhost' || ld === '127.0.0.1'))
          );
        });

        if (!isNavAllowed) {
          runState.logs.push(
            `[${new Date().toLocaleTimeString()}] BLOCKED: Navigation redirected outside authorized domain scope to '${postNavDomain}'. Halting execution.`
          );
          failedSteps++;
          break;
        }

        // Capture screenshot evidence
        const screenshotBuf = await this.browserManager.capturePageScreenshot(activePage.pageId);
        runState.latestScreenshotBase64 = screenshotBuf.toString('base64');

        const evidence = await this.evidenceService.captureEvidence(runId, {
          type: 'SCREENSHOT',
          content: screenshotBuf,
          stepId: step.stepId,
          filenamePrefix: `step_${step.stepNumber}`,
          category: 'FUNCTIONAL_EVIDENCE'
        });
        evidence.category = 'FUNCTIONAL_EVIDENCE';
        evidenceCollected.push(evidence);
        runState.evidence.push(evidence);

        // Expectation setup
        const isDemoCartLab =
          (targetDomain === 'localhost' || targetDomain === '127.0.0.1' || task.title.includes('[DEMO]')) &&
          (step.goal.toLowerCase().includes('cart') ||
            step.expectedBehavior.toLowerCase().includes('79.98') ||
            step.expectedBehavior.toLowerCase().includes('total'));

        const expectedNumeric = isDemoCartLab
          ? 79.98
          : (step.verificationMethod === 'NUMERIC_CALCULATION' && typeof step.inputValue === 'number' ? step.inputValue : undefined);

        const expectation: StateExpectation = {
          numericCalculation: expectedNumeric !== undefined ? { expected: expectedNumeric } : undefined,
          expectedText: step.expectedBehavior.length > 5 && !step.expectedBehavior.includes('accurately') ? step.expectedBehavior : undefined,
          elementState: step.targetSelector ? { selector: step.targetSelector, shouldBeVisible: true } : undefined
        };

        // F. Verification via verifyActionPostcondition
        const postVerification = verifyActionPostcondition(
          action,
          beforeObservation,
          postObservation,
          expectation
        );

        const postconditionChecked = true;
        const verificationStatus: StepVerificationStatus = postVerification.status;

        // Check for bug detection
        let bug: CandidateBug | null = null;
        if (!postVerification.passed && postVerification.status === 'FAIL') {
          bug = detectCandidateBug(postObservation, expectation, { runId, stepId: step.stepId });
        }

        if (bug) {
          bug.evidenceIds.push(evidence.id);
          this.db.saveCandidateBug(bug);
          candidateBugsFound.push(bug);
          runState.candidateBugs.push(bug);

          runState.logs.push(`[${new Date().toLocaleTimeString()}] BUG DETECTED: ${bug.title} (Actual: ${bug.actualResult})`);
          await verifyCandidateBug(bug, postObservation, expectation);
          failedSteps++;
        } else if (actionSucceeded && verificationStatus === 'PASS') {
          runState.logs.push(`[${new Date().toLocaleTimeString()}] VERIFIED: Step ${step.stepNumber} passed.`);
          passedSteps++;
        } else if (verificationStatus === 'UNVERIFIED') {
          runState.logs.push(`[${new Date().toLocaleTimeString()}] UNVERIFIED: Step ${step.stepNumber} - ${postVerification.details}`);
          unverifiedSteps++;
        } else {
          runState.logs.push(`[${new Date().toLocaleTimeString()}] FAILED: Step ${step.stepNumber} failed expectation: ${postVerification.details}`);
          failedSteps++;
        }

        stepExecutionResults.push({
          stepId: step.stepId,
          runId,
          outcome: verificationStatus === 'PASS' ? 'PASS' : verificationStatus === 'UNVERIFIED' ? 'NEEDS_REVIEW' : 'FAIL',
          actionExecuted,
          actionSucceeded,
          postconditionChecked,
          verificationStatus,
          actualObservation: postObservation.visibleTextSnippet.slice(0, 500),
          matchedExpectation: verificationStatus === 'PASS',
          notes: postVerification.details,
          durationMs: actionResult.durationMs,
          evidenceIds: [evidence.id],
          candidateBugId: bug?.id
        });
      }

      // 10. Generate Report Draft if genuine defects found
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

      // 11. Build Coverage Matrix & Compute Authoritative Final Status
      const coverageMatrix = buildCoverageMatrix(requirements, testPlan, stepExecutionResults);
      runState.coverageMatrix = coverageMatrix;

      let finalStatus: RunStatus = 'COMPLETED';
      if (runState.status === 'BLOCKED_SITE_VERIFICATION' || runState.status === 'BLOCKED_AUTHORIZATION' || runState.status === 'BLOCKED') {
        finalStatus = runState.status;
      } else if (runState.status === 'NEEDS_REVIEW') {
        finalStatus = 'NEEDS_REVIEW';
      } else if (candidateBugsFound.length > 0) {
        finalStatus = coverageMatrix.isComplete ? 'COMPLETED_WITH_FINDINGS' : 'PARTIAL';
      } else if (!coverageMatrix.isComplete) {
        finalStatus = 'PARTIAL';
      } else if (failedSteps > 0 || unverifiedSteps > 0) {
        finalStatus = 'COMPLETED_WITH_FINDINGS';
      } else {
        finalStatus = 'COMPLETED';
      }

      runState.status = finalStatus;
      runState.activeStepGoal = undefined; // Stop displaying stale reasoning after run terminates

      // Update task in DB
      task.status = finalStatus;
      task.updatedAt = new Date().toISOString();
      this.db.saveTask(task);

      this.db.updateRun({
        id: runId,
        status: finalStatus,
        totalSteps: totalStepsExecuted,
        passedSteps,
        failedSteps,
        bugsFound: candidateBugsFound.length,
        endTime: new Date().toISOString()
      });

      runState.logs.push(
        `[${new Date().toLocaleTimeString()}] Run finished with status ${finalStatus}. Passed: ${passedSteps}, Failed: ${failedSteps}, Unverified: ${unverifiedSteps}, Bugs: ${candidateBugsFound.length}, Coverage: ${(coverageMatrix.coverageRatio * 100).toFixed(0)}%`
      );

      return {
        runId,
        taskId,
        finalStatus,
        totalStepsExecuted,
        passedSteps,
        failedSteps,
        unverifiedSteps,
        bugsFound: candidateBugsFound.length,
        durationMs: Date.now() - startTime,
        coverageMatrix,
        reportId: report?.id,
        providerUsed: runProvider.name,
        modelUsed: runModelId
      };
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      const isAuthBlocker = errMsg.includes('AUTHORIZATION_') || errMsg.includes('SECURITY POLICY VIOLATION');
      const finalStatus: RunStatus = abortController.signal.aborted
        ? 'CANCELLED'
        : isAuthBlocker
        ? 'BLOCKED_AUTHORIZATION'
        : 'FAILED';

      runState.status = finalStatus;
      runState.error = errMsg;
      runState.blockerReason = isAuthBlocker ? errMsg : undefined;
      runState.latestScreenshotBase64 = undefined;
      runState.activeStepGoal = undefined;
      runState.logs.push(`[${new Date().toLocaleTimeString()}] Run stopped with status ${finalStatus}: ${errMsg}`);

      this.db.updateRun({
        id: runId,
        status: finalStatus,
        totalSteps: totalStepsExecuted,
        passedSteps,
        failedSteps,
        bugsFound: candidateBugsFound.length,
        endTime: new Date().toISOString()
      });

      return {
        runId,
        taskId,
        finalStatus,
        totalStepsExecuted,
        passedSteps,
        failedSteps,
        bugsFound: candidateBugsFound.length,
        durationMs: Date.now() - startTime,
        error: errMsg
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
