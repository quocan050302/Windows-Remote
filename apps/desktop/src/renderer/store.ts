import { create } from 'zustand';
import type { ExecutionMode, TaskStatus, CandidateBug, ReportDraft } from '@test-io-agent/shared';

export interface StudioState {
  currentTab: 'dashboard' | 'inbox' | 'workspace' | 'reports' | 'settings';
  executionMode: ExecutionMode;
  agentStatus: TaskStatus;
  currentStep: number;
  totalSteps: number;
  activeRunId: string | null;
  activeTaskId: string | null;
  targetUrl: string;
  isPaused: boolean;
  isUserTakeover: boolean;
  candidateBugs: CandidateBug[];
  recentReports: ReportDraft[];
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
  
  // Actions
  setTab: (tab: StudioState['currentTab']) => void;
  setExecutionMode: (mode: ExecutionMode) => void;
  setTargetUrl: (url: string) => void;
  startRun: (taskId?: string) => Promise<void>;
  pauseRun: () => void;
  resumeRun: () => void;
  stopRun: () => Promise<void>;
  triggerTakeover: () => void;
  fetchMetrics: () => Promise<void>;
}

export const useStudioStore = create<StudioState>((set, get) => ({
  currentTab: 'dashboard',
  executionMode: 'COPILOT_MODE',
  agentStatus: 'READY',
  currentStep: 0,
  totalSteps: 4,
  activeRunId: null,
  activeTaskId: null,
  targetUrl: 'http://127.0.0.1:4173',
  isPaused: false,
  isUserTakeover: false,
  candidateBugs: [],
  recentReports: [],
  metrics: {
    taskCount: 3,
    activeRuns: 0,
    pendingReviews: 1,
    bugCount: 1,
    reportCount: 1
  },
  mcpConnected: true,
  browserConnected: true,
  modelReady: true,

  setTab: (tab) => set({ currentTab: tab }),
  setExecutionMode: (mode) => set({ executionMode: mode }),
  setTargetUrl: (url) => set({ targetUrl: url }),

  startRun: async (taskId) => {
    const runId = `run_${Date.now()}`;
    set({
      agentStatus: 'RUNNING',
      activeRunId: runId,
      activeTaskId: taskId || 'task_demo_1',
      isPaused: false,
      isUserTakeover: false,
      currentStep: 1
    });

    try {
      if ((window as any).electronAPI) {
        await (window as any).electronAPI.startRun({
          runId,
          targetUrl: get().targetUrl,
          taskId: get().activeTaskId
        });
      }
    } catch (_) {}
  },

  pauseRun: () => set({ isPaused: true, agentStatus: 'PAUSED' }),
  resumeRun: () => set({ isPaused: false, agentStatus: 'RUNNING' }),

  stopRun: async () => {
    const runId = get().activeRunId;
    if (runId && (window as any).electronAPI) {
      await (window as any).electronAPI.stopRun(runId);
    }
    set({
      agentStatus: 'CANCELLED',
      activeRunId: null,
      isPaused: false
    });
  },

  triggerTakeover: () => {
    set({ isUserTakeover: true, isPaused: true, agentStatus: 'PAUSED' });
  },

  fetchMetrics: async () => {
    if ((window as any).electronAPI) {
      try {
        const m = await (window as any).electronAPI.getMetrics();
        if (m) set({ metrics: m });
      } catch (_) {}
    }
  }
}));
