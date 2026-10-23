/**
 * @test-io-agent/shared
 * Core TypeScript definitions and contracts for Test IO Agent Studio.
 */

// ==========================================
// 1. Task, Lifecycle & Execution State
// ==========================================

export type ExecutionMode = 'COPILOT_MODE' | 'SUPERVISED_MODE' | 'AUTHORIZED_AUTO_MODE' | 'MANUAL_ONLY';

export type BrowserLaunchMode = 'HEADLESS_AUTOMATION' | 'VISIBLE_SUPERVISED' | 'MANUAL_ONLY';

export type ControlOwnership = 'AI_PLAYWRIGHT' | 'HUMAN' | 'NONE';

export type RunStatus =
  | 'READY'
  | 'RUNNING'
  | 'PAUSED'
  | 'AWAITING_HUMAN_VERIFICATION'
  | 'HUMAN_CONTROL_ACTIVE'
  | 'VERIFYING_PAGE_ACCESS'
  | 'READY_TO_RESUME'
  | 'MANUAL_ONLY'
  | 'COMPLETED'
  | 'COMPLETED_WITH_FINDINGS'
  | 'PARTIAL'
  | 'BLOCKED_SITE_VERIFICATION'
  | 'BLOCKED_AUTHORIZATION'
  | 'BLOCKED'
  | 'NEEDS_REVIEW'
  | 'FAILED'
  | 'CANCELLED';

export type TaskStatus =
  | 'CREATED'
  | 'ANALYZING'
  | 'NEEDS_REVIEW'
  | 'READY'
  | 'RUNNING'
  | 'PAUSED'
  | 'AWAITING_HUMAN_VERIFICATION'
  | 'HUMAN_CONTROL_ACTIVE'
  | 'READY_TO_RESUME'
  | 'MANUAL_ONLY'
  | 'BLOCKED'
  | 'BLOCKED_SITE_VERIFICATION'
  | 'BLOCKED_AUTHORIZATION'
  | 'PARTIAL'
  | 'COMPLETED'
  | 'COMPLETED_WITH_FINDINGS'
  | 'FAILED'
  | 'CANCELLED';

export type TestingModuleType =
  | 'EXPLORATORY'
  | 'TEST_CASE'
  | 'REGRESSION'
  | 'BUG_REPRODUCTION'
  | 'BUG_FIX_CONFIRMATION'
  | 'LLM_TESTING'
  | 'USABILITY'
  | 'ACCESSIBILITY'
  | 'LOCALIZATION'
  | 'MOBILE_MANUAL_ASSISTED'
  | 'PAYMENT_MANUAL_ASSISTED'
  | 'UNKNOWN';

export interface TaskInput {
  id?: string;
  title: string;
  description: string;
  sourcePlatform?: string;
  targetUrl?: string;
  targetApp?: string;
  cycleId?: string;
  requestedBy?: string;
  metadata?: Record<string, unknown>;
}

export interface TaskRecord {
  id: string;
  title: string;
  description: string;
  sourcePlatform: string;
  targetUrl?: string;
  targetApp?: string;
  cycleId?: string;
  status: TaskStatus;
  executionMode: ExecutionMode;
  analysis?: TaskAnalysis;
  createdAt: string;
  updatedAt: string;
}

export interface TaskAnalysis {
  taskId: string;
  taskType: TestingModuleType;
  targetApplication: string;
  authorizedDomains: string[];
  inScopeFeatures: string[];
  outOfScopeFeatures: string[];
  requirements: string[];
  requiredDevice: string;
  reportingRequirements: string[];
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  missingInformation: string[];
  needsReviewReason?: string;
  confidenceScore: number;
}

// ==========================================
// 2. Planning & Step Execution
// ==========================================

export type StepRiskCategory = 'LOW' | 'MEDIUM' | 'HIGH';

export interface TestPlanStep {
  stepId: string;
  stepNumber: number;
  goal: string;
  preconditions: string[];
  actionType: string;
  targetSelector?: string;
  targetDescription?: string;
  inputValue?: string;
  expectedBehavior: string;
  allowedActions: string[];
  verificationMethod: string;
  riskCategory: StepRiskCategory;
  evidenceRequirements: string[];
}

export interface TestPlan {
  planId: string;
  taskId: string;
  summary: string;
  steps: TestPlanStep[];
  outOfScopeBoundaries: string[];
  planVersion?: number;
  requirementsFingerprint?: string;
  createdAt: string;
}

export type StepExecutionOutcome = 'PASS' | 'FAIL' | 'BLOCKED' | 'SKIPPED' | 'NEEDS_REVIEW';

export type StepVerificationStatus =
  | 'PASS'
  | 'FAIL'
  | 'UNVERIFIED'
  | 'BLOCKED'
  | 'NOT_APPLICABLE'
  | 'NEEDS_REVIEW';

export interface StepExecutionResult {
  stepId: string;
  runId: string;
  outcome: StepExecutionOutcome;
  actionExecuted: boolean;
  actionSucceeded: boolean;
  postconditionChecked: boolean;
  verificationStatus: StepVerificationStatus;
  actualObservation: string;
  matchedExpectation: boolean;
  notes?: string;
  durationMs: number;
  evidenceIds: string[];
  candidateBugId?: string;
}

export type PageAccessState =
  | 'NORMAL_APPLICATION_PAGE'
  | 'AUTHENTICATION_REQUIRED'
  | 'CAPTCHA_CHALLENGE'
  | 'SECURITY_CHALLENGE'
  | 'RATE_LIMITED'
  | 'ACCESS_DENIED'
  | 'NETWORK_FAILURE';

export interface AccessBlockerResult {
  isBlocked: boolean;
  accessState: PageAccessState;
  blockerType:
    | 'CLOUDFLARE_CHALLENGE'
    | 'CLOUDFLARE_TURNSTILE'
    | 'BOT_DETECTION'
    | 'CAPTCHA'
    | 'RATE_LIMIT'
    | 'RATE_LIMITED'
    | 'ACCESS_DENIED'
    | 'AUTH_REQUIRED'
    | 'NETWORK_ERROR'
    | 'NONE';
  signalsDetected: string[];
  signals?: string[];
  confidenceScore?: number;
  diagnosticDetails: string;
  recommendedRunStatus:
    | 'BLOCKED_SITE_VERIFICATION'
    | 'BLOCKED_AUTHORIZATION'
    | 'NEEDS_REVIEW'
    | 'READY';
}

export interface ApplicationReadyResult {
  isReady: boolean;
  reason: string;
  detectedState: PageAccessState;
  missingPreconditions?: string[];
}

export interface TestRequirementItem {
  id: string;
  category:
    | 'NAVIGATION'
    | 'CTA'
    | 'PROMOTIONAL'
    | 'FEATURED_CONTENT'
    | 'CAROUSEL'
    | 'ACCORDION'
    | 'FORM'
    | 'CALCULATION'
    | 'GENERAL_UI';
  description: string;
  source: string;
  inScope: boolean;
  targetControlDescription?: string;
  title?: string;
}

export interface ScenarioCoverageMapping {
  requirementId: string;
  scenarioStepId: string;
  objective: string;
  targetControl: string;
  expectedBehavior: string;
  executionStatus: 'NOT_RUN' | 'EXECUTED' | 'FAILED' | 'BLOCKED';
  verificationStatus: StepVerificationStatus;
  evidenceIds: string[];
  blockerReason?: string;
  requirementCategory?: string;
}

export interface RequirementsCoverageMatrix {
  taskId: string;
  planId: string;
  totalRequirements: number;
  coveredRequirements: number;
  passedCases: number;
  failedCases: number;
  blockedCases: number;
  skippedCases: number;
  unverifiedCases: number;
  remainingRequirements: number;
  coverageRatio: number;
  coveragePercentage?: number;
  passedScenarios?: number;
  failedScenarios?: number;
  blockedScenarios?: number;
  unverifiedScenarios?: number;
  uncoveredRequirements?: TestRequirementItem[];
  scenarioMappings?: ScenarioCoverageMapping[];
  isComplete: boolean;
  requirements: Array<{
    item: TestRequirementItem;
    scenarios: ScenarioCoverageMapping[];
    status:
      | 'COVERED_PASS'
      | 'COVERED_FAIL'
      | 'BLOCKED'
      | 'UNVERIFIED'
      | 'UNCOVERED'
      | 'EXCLUDED';
  }>;
}

// ==========================================
// 3. Security, Policy & Authorizations
// ==========================================

export type PermissionDecisionStatus = 'ALLOW' | 'DENY' | 'REQUIRE_HUMAN_APPROVAL';

export interface PermissionDecision {
  status: PermissionDecisionStatus;
  reason: string;
  violations?: string[];
  requiredGrant?: string;
}

export type AuthorizationStatus = 'ACTIVE' | 'EXPIRED' | 'REVOKED' | 'PENDING';

export interface AuthorizationAuditEntry {
  action: string;
  timestamp: string;
  actor: string;
  details?: string;
}

export interface AuthorizationRecord {
  id: string;
  grantingOrgOrPerson: string;
  verificationEvidence: string;
  scope: string;
  allowedDomains: string[];
  allowedActions: string[];
  allowedDeviceTypes: string[];
  startTime: string;
  expirationTime: string;
  expiresAt?: string;
  grantingParty?: string;
  isRevoked: boolean;
  status?: AuthorizationStatus;
  revocationReason?: string;
  auditHistory?: AuthorizationAuditEntry[];
  createdAt: string;
  updatedAt?: string;
}

export interface CreateAuthorizationDto {
  grantingOrgOrPerson?: string;
  verificationEvidence?: string;
  scope: string;
  allowedDomains?: string[];
  allowedActions?: string[];
  allowedDeviceTypes?: string[];
  startTime?: string;
  expirationTime?: string;
  domain?: string;
  grantingParty?: string;
  expiresAt?: string;
}

export interface AuthorizationEvaluationResult {
  targetUrl: string;
  targetDomain: string;
  isAuthorized: boolean;
  authorized?: boolean;
  isTestIo?: boolean;
  status: 'AUTHORIZED' | 'UNAUTHORIZED' | 'EXPIRED' | 'REVOKED' | 'BLOCKED_PLATFORM';
  authorization?: AuthorizationRecord;
  reason: string;
  canExecuteAutonomousRun: boolean;
  canOpenManualBrowser: boolean;
}

export interface ActionContext {
  sourcePlatform: string;
  destinationDomain: string;
  testCycleId?: string;
  targetDevice: string;
  authorization?: AuthorizationRecord;
  currentUserId?: string;
  executionMode: ExecutionMode;
}

// ==========================================
// 4. Windows-MCP Contracts
// ==========================================

export interface WindowsMcpConfig {
  pythonPath?: string;
  projectDir?: string;
  allowedTools?: string[];
  idleTimeoutSeconds?: number;
  controlPolicy?: 'relaxed' | 'balanced' | 'strict';
}

export interface McpConnection {
  isConnected: boolean;
  pid?: number;
  transport: 'stdio';
  discoveredTools: string[];
  disconnect: () => Promise<void>;
  callTool: (toolName: string, args: Record<string, unknown>) => Promise<unknown>;
}

export interface DesktopSnapshotOptions {
  includeVision?: boolean;
  includeUiTree?: boolean;
  useAnnotation?: boolean;
  displayIndices?: number[];
  region?: [number, number, number, number];
}

export interface UIElementNode {
  id: string;
  label?: number;
  name: string;
  controlType: string;
  boundingBox?: [number, number, number, number];
  isEnabled: boolean;
  isFocused: boolean;
  windowName?: string;
}

export interface DesktopSnapshot {
  timestamp: string;
  activeWindow?: { title: string; processId: number; bounds?: [number, number, number, number] };
  windows: Array<{ title: string; processId: number }>;
  uiElements: UIElementNode[];
  displayMetadata: Array<{ index: number; width: number; height: number; scale: number }>;
  screenshotBase64?: string;
}

export interface TargetDescriptor {
  labelId?: number;
  elementName?: string;
  controlType?: string;
  windowTitle?: string;
  coordinates?: [number, number];
}

export interface TargetResolution {
  resolved: boolean;
  coordinates?: [number, number];
  labelId?: number;
  confidence: number;
  reason: string;
}

export interface DesktopAction {
  actionType: 'click' | 'type' | 'scroll' | 'move' | 'shortcut' | 'wait' | 'wait_for';
  loc?: [number, number];
  label?: number;
  text?: string;
  button?: 'left' | 'right' | 'middle';
  clicks?: number;
  clear?: boolean;
  pressEnter?: boolean;
  scrollDirection?: 'up' | 'down' | 'left' | 'right';
  shortcut?: string;
  waitDurationSeconds?: number;
  waitForCondition?: string;
}

// ==========================================
// 5. Playwright Browser Contracts
// ==========================================

export interface BrowserSessionOptions {
  headless?: boolean;
  viewport?: { width: number; height: number };
  userAgent?: string;
  launchMode?: BrowserLaunchMode;
  runId?: string;
}

export interface BrowserSession {
  sessionId: string;
  browserId: string;
  contextId: string;
  activePages: string[];
  authorizationId?: string;
  startTime: string;
  isClosed: boolean;
  runId?: string;
  launchMode?: BrowserLaunchMode;
  isHeadless?: boolean;
}

export interface ResumeReadinessResult {
  canResume: boolean;
  pageReady: boolean;
  authorizationValid: boolean;
  sessionAlive: boolean;
  reason: string;
  requiredUserAction?: string;
  detectedState?: PageAccessState;
  currentUrl?: string;
  remainingBlocker?: string;
}

export interface CheckPageResult {
  runId: string;
  sessionId?: string;
  accessState: PageAccessState;
  isBlocked: boolean;
  isReady: boolean;
  blockerReason?: string;
  currentUrl: string;
  pageTitle: string;
  canResume: boolean;
  timestamp: string;
}

export interface BrowserFocusResult {
  sessionId: string;
  broughtToFront: boolean;
  windowIdentifier?: string;
  message: string;
}

export interface BrowserPage {
  pageId: string;
  sessionId: string;
  currentUrl: string;
  title: string;
}

export interface InteractiveControl {
  selector: string;
  role?: string;
  name?: string;
  text?: string;
  tag: string;
  inputType?: string;
  isEnabled: boolean;
  isVisible: boolean;
  boundingBox?: { x: number; y: number; width: number; height: number };
}

export interface PageObservation {
  pageId: string;
  currentUrl: string;
  title: string;
  controls: InteractiveControl[];
  headings: string[];
  visibleTextSnippet: string;
  forms: Array<{ formId?: string; fields: string[] }>;
  links: Array<{ text: string; href: string }>;
  consoleErrors: string[];
  timestamp: string;
}

export type BrowserActionType =
  | 'navigate'
  | 'click'
  | 'fill'
  | 'select'
  | 'scroll'
  | 'check'
  | 'upload'
  | 'capture'
  | 'assert'
  | 'finish';

export interface BrowserAction {
  type: BrowserActionType;
  selector?: string;
  url?: string;
  value?: string;
  optionValue?: string;
  scrollAmount?: { x: number; y: number };
  reason: string;
  expectedObservation: string;
}

export interface ActionResult {
  success: boolean;
  actionSummary: string;
  details?: unknown;
  errorMessage?: string;
  durationMs: number;
}

export interface StateExpectation {
  expectedUrlPattern?: string;
  expectedText?: string;
  elementState?: { selector: string; shouldBeVisible?: boolean; shouldBeEnabled?: boolean };
  numericCalculation?: { expected: number; actualFormula?: string };
}

export interface VerificationResult {
  passed: boolean;
  confidence: number;
  details: string;
  discrepancies?: string[];
  status: 'PASS' | 'FAIL' | 'UNVERIFIED';
}

// ==========================================
// 6. Bug Detection, Evidence & Reports
// ==========================================

export interface CandidateBug {
  id: string;
  runId: string;
  stepId?: string;
  title: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  expectedResult: string;
  actualResult: string;
  pageUrl: string;
  actionHistory: string[];
  environment: string;
  evidenceIds: string[];
  reproductionStatus: 'PENDING' | 'REPRODUCED' | 'NOT_REPRODUCED' | 'INCONCLUSIVE';
  timestamp: string;
}

export interface BugVerification {
  bugId: string;
  attemptNumber: number;
  isReproduced: boolean;
  notes: string;
  verificationEvidenceIds: string[];
  timestamp: string;
}

export interface EvidenceRecord {
  id: string;
  runId: string;
  stepId?: string;
  type: 'SCREENSHOT' | 'TRACE' | 'CONSOLE_LOG' | 'NETWORK_HAR' | 'VIDEO';
  category?: 'FUNCTIONAL_EVIDENCE' | 'DIAGNOSTIC' | 'AUDIT';
  filePath: string;
  fileSizeBytes: number;
  sha256Hash: string;
  isRedacted: boolean;
  capturedAt: string;
}

export interface ReportDraft {
  id: string;
  taskId: string;
  runId: string;
  reportType:
    | 'FUNCTIONAL_BUG'
    | 'TEST_CASE_RESULT'
    | 'REGRESSION_REPORT'
    | 'REPRODUCTION_REPORT'
    | 'USABILITY_REPORT'
    | 'ACCESSIBILITY_REPORT';
  title: string;
  status: 'DRAFT' | 'NEEDS_EVIDENCE' | 'NEEDS_REVIEW' | 'READY_FOR_HUMAN_SUBMISSION' | 'ARCHIVED';
  environmentDetails: {
    os: string;
    browser: string;
    viewport: string;
  };
  stepsToReproduce: string[];
  expectedResult: string;
  actualResult: string;
  evidenceLinks: Array<{ id: string; type: string; sha256: string; path: string }>;
  scopeComplianceNote: string;
  createdAt: string;
  updatedAt: string;
}

export interface ReportValidationResult {
  isValid: boolean;
  missingFields: string[];
  warnings: string[];
}

// ==========================================
// 7. Orchestration, Runs & Audit Logs
// ==========================================

export interface RunResult {
  runId: string;
  taskId: string;
  finalStatus: RunStatus;
  totalStepsExecuted: number;
  passedSteps: number;
  failedSteps: number;
  unverifiedSteps?: number;
  blockedSteps?: number;
  bugsFound: number;
  durationMs: number;
  coverageMatrix?: RequirementsCoverageMatrix;
  reportId?: string;
  error?: string;
  providerUsed?: string;
  modelUsed?: string;
}

export interface StopResult {
  runId: string;
  stopped: boolean;
  reason: string;
  releasedResources: string[];
}

export interface AuditLogEntry {
  id?: string;
  taskId?: string;
  runId?: string;
  toolName: string;
  actionSummary: string;
  permissionDecision: PermissionDecisionStatus;
  targetDomain?: string;
  timestamp: string;
  outcome: 'SUCCESS' | 'DENIED' | 'FAILED';
  errorCode?: string;
}

export interface ApplicationSettings {
  defaultExecutionMode: ExecutionMode;
  aiProvider: string;
  model: string;
  tokenBudget: number;
  maxSteps: number;
  maxRuntimeSeconds: number;
  browserEngine: string;
  screenshotResolution: 'high' | 'medium' | 'low';
  loggingLevel: 'debug' | 'info' | 'warn' | 'error';
  theme: 'dark' | 'light' | 'system';
  browserMode?: BrowserLaunchMode;
  openVisibleChromium?: boolean;
  keepBrowserOpenDuringHumanReview?: boolean;
  browserViewport?: { width: number; height: number };
  humanControlPolicy?: 'strict' | 'relaxed';
}

export interface ModelUsageRecord {
  id?: string;
  runId?: string;
  provider: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  latencyMs: number;
  timestamp: string;
}

// ==========================================
// 8. Settings V2 & Secure AI Configuration Types
// ==========================================

export type AiProviderId = 'gemini' | 'openai' | 'anthropic' | 'ollama' | 'deterministic';

export type ProviderConnectionStatus =
  | 'NOT_CONFIGURED'
  | 'SAVED_UNVERIFIED'
  | 'VERIFYING'
  | 'CONNECTED'
  | 'INVALID_CREDENTIAL'
  | 'MODEL_UNAVAILABLE'
  | 'INFERENCE_FAILED'
  | 'RATE_LIMITED'
  | 'QUOTA_EXCEEDED'
  | 'NETWORK_ERROR'
  | 'SERVICE_UNAVAILABLE'
  | 'CONFIGURATION_ERROR';

export type AiCapabilityProfile =
  | 'TEXT_QA'
  | 'STRUCTURED_TEST_PLANNING'
  | 'BROWSER_AGENT'
  | 'VISION_QA';

export interface ProviderPublicStatus {
  id: AiProviderId;
  name: string;
  hasStoredCredential: boolean;
  isConfiguredViaEnv: boolean;
  connectionStatus: ProviderConnectionStatus;
  selectedModel?: string;
  availableModels: string[];
  lastTestedAt?: string;
  lastLatencyMs?: number;
  errorReason?: string;
  endpointUrl?: string;
}

export interface ProviderConnectionResult {
  providerId: AiProviderId;
  status: ProviderConnectionStatus;
  selectedModel?: string;
  availableModels: string[];
  latencyMs?: number;
  checkedAt: string;
  details?: string;
  inferenceReady: boolean;
}

export interface ActiveAiRuntime {
  providerId: AiProviderId;
  providerName: string;
  modelId: string;
  status: ProviderConnectionStatus;
  inferenceReady: boolean;
  credentialSource: 'SECURE_STORE' | 'ENVIRONMENT' | 'BUILTIN';
  providerType: 'cloud' | 'local' | 'deterministic';
  lastVerifiedAt?: string;
}

export interface SettingsUpdateRequest {
  activeProvider?: AiProviderId;
  defaultExecutionMode?: ExecutionMode;
  ollamaBaseUrl?: string;
  browserMode?: BrowserLaunchMode;
  openVisibleChromium?: boolean;
  keepBrowserOpenDuringHumanReview?: boolean;
  browserViewport?: { width: number; height: number };
  humanControlPolicy?: 'strict' | 'relaxed';
}

export interface PublicSettingsResponse {
  activeProvider: AiProviderId;
  activeRuntime: ActiveAiRuntime;
  providers: Record<AiProviderId, ProviderPublicStatus>;
  executionMode: ExecutionMode;
  securityPolicy: {
    strictMode: boolean;
    blockedExternalDomains: string[];
    allowAutoExternalSubmit: boolean;
  };
  browserExecution?: {
    browserMode: BrowserLaunchMode;
    openVisibleChromium: boolean;
    keepBrowserOpenDuringHumanReview: boolean;
    browserViewport: { width: number; height: number };
    humanControlPolicy: 'strict' | 'relaxed';
  };
}

