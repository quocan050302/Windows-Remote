import { create } from 'zustand';
import type { ExecutionMode, TaskStatus, CandidateBug, ReportDraft, TaskRecord, TestPlan, EvidenceRecord } from '@test-io-agent/shared';
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
  runtimeInfo: RuntimeInfo;
  liveScreenshotBase64?: string;
  liveLogs: string[];
  pollInterval?: any;
  
  // Actions
  setTab: (tab: StudioState['currentTab']) => void;
  setExecutionMode: (mode: ExecutionMode) => void;
  setTargetUrl: (url: string) => void;
  checkRuntime: () => Promise<void>;
  fetchTasks: () => Promise<void>;
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
  runtimeInfo: { type: 'browser-api', label: 'Detecting runtime...' },
  liveScreenshotBase64: undefined,
  liveLogs: [],

  setTab: (tab) => set({ currentTab: tab }),
  setExecutionMode: (mode) => set({ executionMode: mode }),
  setTargetUrl: (url) => set({ targetUrl: url }),

  checkRuntime: async () => {
    const info = await apiClient.detectRuntime();
    set({ runtimeInfo: info });
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

    // Fetch plan for active task if not yet loaded
    get().fetchPlan(task);

    set({
      agentStatus: 'RUNNING',
      activeRunId: runId,
      activeTaskId: task,
      targetUrl: target,
      isPaused: false,
      isUserTakeover: false,
      currentStep: 1,
      liveLogs: [`[${new Date().toLocaleTimeString()}] Starting run ${runId}...`]
    });

    try {
      await apiClient.startRun({
        runId,
        targetUrl: target,
        taskId: task
      });
    } catch (err: any) {
      set({
        agentStatus: 'FAILED',
        liveLogs: [...get().liveLogs, `[${new Date().toLocaleTimeString()}] Error: ${err.message}`]
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
          set({
            agentStatus: state.status,
            currentStep: state.currentStep,
            totalSteps: state.totalSteps || get().totalSteps,
            activeStepGoal: state.activeStepGoal,
            liveScreenshotBase64: state.latestScreenshotBase64 || get().liveScreenshotBase64,
            liveLogs: state.logs && state.logs.length > 0 ? state.logs : get().liveLogs,
            candidateBugs: state.candidateBugs || get().candidateBugs,
            evidence: state.evidence || get().evidence
          });

          if (state.status === 'COMPLETED' || state.status === 'FAILED' || state.status === 'CANCELLED') {
            clearInterval(interval);
            get().fetchMetrics();
            get().fetchTasks();
            get().fetchPlan(task);
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
