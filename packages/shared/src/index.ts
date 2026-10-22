/**
 * @test-io-agent/shared
 * Core TypeScript definitions and contracts for Test IO Agent Studio.
 */

// ==========================================
// 1. Task, Lifecycle & Execution State
// ==========================================

export type ExecutionMode = 'COPILOT_MODE' | 'SUPERVISED_MODE' | 'AUTHORIZED_AUTO_MODE';

export type TaskStatus =
  | 'CREATED'
  | 'ANALYZING'
  | 'NEEDS_REVIEW'
  | 'READY'
  | 'RUNNING'
  | 'PAUSED'
  | 'BLOCKED'
  | 'COMPLETED'
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
  createdAt: string;
}

export type StepExecutionOutcome = 'PASS' | 'FAIL' | 'BLOCKED' | 'SKIPPED' | 'NEEDS_REVIEW';

export interface StepExecutionResult {
  stepId: string;
  runId: string;
  outcome: StepExecutionOutcome;
  actualObservation: string;
  matchedExpectation: boolean;
  notes?: string;
  durationMs: number;
  evidenceIds: string[];
  candidateBugId?: string;
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
  isRevoked: boolean;
  createdAt: string;
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
}

export interface BrowserSession {
  sessionId: string;
  browserId: string;
  contextId: string;
  activePages: string[];
  authorizationId?: string;
  startTime: string;
  isClosed: boolean;
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
  finalStatus: TaskStatus;
  totalStepsExecuted: number;
  passedSteps: number;
  failedSteps: number;
  bugsFound: number;
  durationMs: number;
  reportId?: string;
  error?: string;
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
