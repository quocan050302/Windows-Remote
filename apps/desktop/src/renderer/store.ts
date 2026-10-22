import { create } from 'zustand';
import type { 
  ExecutionMode, 
  TaskStatus, 
  CandidateBug, 
  ReportDraft, 
  TaskRecord, 
  TestPlan, 
  EvidenceRecord, 
  ActiveAiRuntime,
  AuthorizationRecord,
  AuthorizationEvaluationResult,
  CreateAuthorizationDto,
  RequirementsCoverageMatrix
} from '@test-io-agent/shared';
import { apiClient, type RuntimeInfo } from './api';

export interface StudioState {
  currentTab: 'dashboard' | 'inbox' | 'workspace' | 'reports' | 'settings';
  executionMode: ExecutionMode;
  agentStatus: TaskStatus;
  currentStep: number;
  totalSteps: number;
  activeStepGoal?: string;
  activeRunId: string | null;
  activeTaskId: string | null;
  activePlan: TestPlan | null;
  targetUrl: string;
  isPaused: boolean;
  isUserTakeover: boolean;
  candidateBugs: CandidateBug[];
  evidence: EvidenceRecord[];
  recentReports: ReportDraft[];
  tasks: TaskRecord[];
  authorizations: AuthorizationRecord[];
  targetAuthorization: AuthorizationEvaluationResult | null;
  coverageMatrix?: RequirementsCoverageMatrix;
  blockerReason?: string;
  providerUsed?: string;
  modelUsed?: string;
  metrics: {
    taskCount: number;
    activeRuns: number;
    pendingReviews: number;
    bugCount: number;
    reportCount: number;
  };
  mcpConnected: boolean;
  browserConnected: boolean;
  modelReady: boolean;
  activeAiRuntime: ActiveAiRuntime | null;
  runtimeInfo: RuntimeInfo;
  liveScreenshotBase64?: string;
  liveLogs: string[];
  pollInterval?: any;
  
  // Actions
  setTab: (tab: StudioState['currentTab']) => void;
  setExecutionMode: (mode: ExecutionMode) => void;
  setTargetUrl: (url: string) => void;
  checkRuntime: () => Promise<void>;
  fetchActiveAiStatus: () => Promise<void>;
  fetchTasks: () => Promise<void>;
  fetchAuthorizations: () => Promise<void>;
  createAuthorization: (dto: CreateAuthorizationDto) => Promise<AuthorizationRecord | null>;
  revokeAuthorization: (id: string, reason?: string) => Promise<boolean>;
  evaluateTargetAuthorization: (url?: string) => Promise<AuthorizationEvaluationResult | null>;
  fetchPlan: (taskId: string) => Promise<void>;
  importTask: (taskData: any) => Promise<any>;
  startRun: (taskId?: string, targetUrl?: string) => Promise<void>;
  pauseRun: () => Promise<void>;
  resumeRun: () => Promise<void>;
  stopRun: () => Promise<void>;
  triggerTakeover: () => Promise<void>;
  fetchMetrics: () => Promise<void>;
  fetchMcpStatus: () => Promise<void>;
  connectMcp: () => Promise<void>;
  disconnectMcp: () => Promise<void>;
}

export const useStudioStore = create<StudioState>((set, get) => ({
  currentTab: 'dashboard',
  executionMode: 'COPILOT_MODE',
  agentStatus: 'READY',
  currentStep: 0,
  totalSteps: 4,
  activeStepGoal: undefined,
  activeRunId: null,
  activeTaskId: null,
  activePlan: null,
  targetUrl: 'http://127.0.0.1:4173',
  isPaused: false,
  isUserTakeover: false,
  candidateBugs: [],
  evidence: [],
  recentReports: [],
  tasks: [],
  authorizations: [],
  targetAuthorization: null,
  metrics: {
    taskCount: 0,
    activeRuns: 0,
    pendingReviews: 0,
    bugCount: 0,
    reportCount: 0
  },
  mcpConnected: false,
  browserConnected: true,
  modelReady: true,
  activeAiRuntime: null,
  runtimeInfo: { type: 'browser-api', label: 'Detecting runtime...' },
  liveScreenshotBase64: undefined,
  liveLogs: [],

  setTab: (tab) => set({ currentTab: tab }),
  setExecutionMode: (mode) => set({ executionMode: mode }),
  setTargetUrl: (url) => {
    set({ targetUrl: url });
    get().evaluateTargetAuthorization(url);
  },

  checkRuntime: async () => {
    const info = await apiClient.detectRuntime();
    set({ runtimeInfo: info });
  },

  fetchActiveAiStatus: async () => {
    try {
      const runtime = await apiClient.getActiveAiStatus();
      if (runtime) {
        set({ activeAiRuntime: runtime, modelReady: runtime.inferenceReady });
      }
    } catch (_) {}
  },

  fetchTasks: async () => {
    try {
      const taskList = await apiClient.listTasks();
      if (taskList && Array.isArray(taskList)) {
        set({ tasks: taskList });
      }
    } catch (err) {
      console.warn('Could not fetch tasks:', err);
    }
  },

  fetchAuthorizations: async () => {
    try {
      const auths = await apiClient.listAuthorizations();
      set({ authorizations: auths || [] });
    } catch (err) {
      console.warn('Could not fetch authorizations:', err);
    }
  },

  createAuthorization: async (dto) => {
    try {
      const created = await apiClient.createAuthorization(dto);
      await get().fetchAuthorizations();
      await get().evaluateTargetAuthorization(get().targetUrl);
      return created;
    } catch (err) {
      console.error('Failed to create authorization:', err);
      return null;
    }
  },

  revokeAuthorization: async (id, reason) => {
    try {
      const ok = await apiClient.revokeAuthorization(id, reason);
      await get().fetchAuthorizations();
      await get().evaluateTargetAuthorization(get().targetUrl);
      return ok;
    } catch (err) {
      console.error('Failed to revoke authorization:', err);
      return false;
    }
  },

  evaluateTargetAuthorization: async (url) => {
    const target = url || get().targetUrl;
    if (!target) return null;
    try {
      const evalResult = await apiClient.evaluateAuthorization(target);
      set({ targetAuthorization: evalResult });
      return evalResult;
    } catch (_) {
      return null;
    }
  },

  fetchPlan: async (taskId: string) => {
    try {
      const plan = await apiClient.getTaskPlan(taskId);
      if (plan) {
        set({ activePlan: plan, totalSteps: plan.steps?.length || get().totalSteps });
      }
    } catch (err) {
      console.warn('Could not fetch task plan:', err);
    }
  },

  importTask: async (taskData) => {
    const res = await apiClient.importTask(taskData);
    await get().fetchTasks();
    await get().fetchMetrics();
    return res;
  },

  startRun: async (taskId, targetUrl) => {
    const runId = `run_${Date.now()}`;
    const target = targetUrl || get().targetUrl;
    const task = taskId || get().activeTaskId || 'task_demo_1';

    // Clear previous run state immediately: stale screenshots, bugs, evidence, activeStepGoal, coverage
    set({
      agentStatus: 'RUNNING',
      activeRunId: runId,
      activeTaskId: task,
      targetUrl: target,
      isPaused: false,
      isUserTakeover: false,
      currentStep: 1,
      activeStepGoal: undefined,
      liveScreenshotBase64: undefined,
      candidateBugs: [],
      evidence: [],
      coverageMatrix: undefined,
      blockerReason: undefined,
      providerUsed: undefined,
      modelUsed: undefined,
      liveLogs: [`[${new Date().toLocaleTimeString()}] Initializing test run ${runId} against ${target}...`]
    });

    // Check target authorization status before executing
    const evalResult = await get().evaluateTargetAuthorization(target);
    if (evalResult && !evalResult.authorized) {
      set({
        agentStatus: 'BLOCKED_AUTHORIZATION',
        blockerReason: evalResult.reason || 'Missing explicit verified authorization record.',
        liveLogs: [
          `[${new Date().toLocaleTimeString()}] [PERMISSION BLOCKED] Target URL ${target} is not authorized for autonomous AI execution.`,
          `[${new Date().toLocaleTimeString()}] Reason: ${evalResult.reason || 'Missing explicit verified authorization record.'}`,
          `[${new Date().toLocaleTimeString()}] To proceed, authorize this domain via Settings > Authorized Websites or use manual viewing.`
        ]
      });
      return;
    }

    // Fetch plan for active task if not yet loaded
    get().fetchPlan(task);

    try {
      await apiClient.startRun({
        runId,
        targetUrl: target,
        taskId: task
      });
    } catch (err: any) {
      const isAuthBlocker = err.message?.includes('AUTHORIZATION_REQUIRED') || err.message?.includes('AUTHORIZATION_REVOKED') || err.message?.includes('AUTHORIZATION_EXPIRED');
      set({
        agentStatus: isAuthBlocker ? 'BLOCKED_AUTHORIZATION' : 'FAILED',
        blockerReason: isAuthBlocker ? err.message : undefined,
        liveLogs: [...get().liveLogs, `[${new Date().toLocaleTimeString()}] ${isAuthBlocker ? '[PERMISSION BLOCKER]' : 'Execution Error'}: ${err.message}`]
      });
      return;
    }

    // Start live polling loop
    if (get().pollInterval) {
      clearInterval(get().pollInterval);
    }

    const interval = setInterval(async () => {
      const activeId = get().activeRunId;
      if (!activeId) {
        clearInterval(interval);
        return;
      }

      try {
        const state = await apiClient.getRunState(activeId);
        if (state) {
          const isTerminal = ['COMPLETED', 'COMPLETED_WITH_FINDINGS', 'PARTIAL', 'BLOCKED_SITE_VERIFICATION', 'BLOCKED_AUTHORIZATION', 'BLOCKED', 'NEEDS_REVIEW', 'FAILED', 'CANCELLED'].includes(state.status);
          set({
            agentStatus: state.status,
            currentStep: state.currentStep,
            totalSteps: state.totalSteps || get().totalSteps,
            // Only keep activeStepGoal if still actively running; clear when finished
            activeStepGoal: isTerminal ? undefined : state.activeStepGoal,
            liveScreenshotBase64: state.latestScreenshotBase64 ? state.latestScreenshotBase64 : (isTerminal ? get().liveScreenshotBase64 : get().liveScreenshotBase64),
            liveLogs: state.logs && state.logs.length > 0 ? state.logs : get().liveLogs,
            candidateBugs: state.candidateBugs || get().candidateBugs,
            evidence: state.evidence || get().evidence,
            coverageMatrix: state.coverageMatrix || get().coverageMatrix,
            blockerReason: state.blockerReason || get().blockerReason,
            providerUsed: state.providerUsed || get().providerUsed,
            modelUsed: state.modelUsed || get().modelUsed
          });

          if (isTerminal) {
            clearInterval(interval);
            get().fetchMetrics();
            get().fetchTasks();
            get().fetchPlan(task);
            get().evaluateTargetAuthorization(get().targetUrl);
            get().fetchActiveAiStatus();
          }
        }
      } catch (_) {}
    }, 1000);

    set({ pollInterval: interval });
  },

  pauseRun: async () => {
    const runId = get().activeRunId;
    if (runId) {
      await apiClient.pauseRun(runId);
    }
    set({ isPaused: true, agentStatus: 'PAUSED' });
  },

  resumeRun: async () => {
    const runId = get().activeRunId;
    if (runId) {
      await apiClient.resumeRun(runId);
    }
    set({ isPaused: false, agentStatus: 'RUNNING' });
  },

  stopRun: async () => {
    const runId = get().activeRunId;
    if (runId) {
      await apiClient.stopRun(runId);
    }
    if (get().pollInterval) {
      clearInterval(get().pollInterval);
    }
    set({
      agentStatus: 'CANCELLED',
      activeRunId: null,
      isPaused: false
    });
    get().fetchMetrics();
  },

  triggerTakeover: async () => {
    const nextState = !get().isUserTakeover;
    set({ isUserTakeover: nextState, isPaused: nextState, agentStatus: nextState ? 'PAUSED' : 'RUNNING' });
    await apiClient.takeoverMcp(nextState);
  },

  fetchMetrics: async () => {
    try {
      const m = await apiClient.getMetrics();
      if (m) set({ metrics: m });
    } catch (_) {}
  },

  fetchMcpStatus: async () => {
    try {
      const status = await apiClient.getMcpStatus();
      set({ mcpConnected: Boolean(status?.isConnected) });
    } catch (_) {
      set({ mcpConnected: false });
    }
  },

  connectMcp: async () => {
    try {
      const status = await apiClient.connectMcp();
      set({ mcpConnected: Boolean(status?.isConnected) });
    } catch (_) {
      set({ mcpConnected: false });
    }
  },

  disconnectMcp: async () => {
    try {
      await apiClient.disconnectMcp();
      set({ mcpConnected: false });
    } catch (_) {}
  }
}));
