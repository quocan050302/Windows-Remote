import React from 'react';
import { useStudioStore } from '../store';
import { 
  Play, 
  CheckCircle, 
  AlertTriangle, 
  FileText, 
  Activity, 
  ShieldCheck, 
  Cpu, 
  Globe 
} from 'lucide-react';

export const Dashboard: React.FC = () => {
  const { metrics, mcpConnected, browserConnected, modelReady, executionMode, startRun, setTab } = useStudioStore();

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8 overflow-y-auto h-full">
      {/* Top Welcome Banner */}
      <div className="flex justify-between items-center bg-gradient-to-r from-blue-900/40 via-purple-900/30 to-slate-900/50 p-6 rounded-2xl border border-blue-500/20 backdrop-blur-xl">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <span>🛡️</span> Test IO Agent Studio
            <span className="text-xs px-2.5 py-1 rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30">
              V1.0 Production
            </span>
          </h1>
          <p className="text-slate-400 mt-1 text-sm">
            Autonomous & Supervised AI Testing System — Windows-MCP & Playwright Engine
          </p>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={() => { startRun(); setTab('workspace'); }}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-medium px-5 py-2.5 rounded-xl shadow-lg shadow-blue-600/30 transition-all hover:scale-105"
          >
            <Play className="w-4 h-4 fill-white" /> Start Authorized Run
          </button>
        </div>
      </div>

      {/* Connection & Health Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="glass-panel p-4 flex items-center gap-4">
          <div className={`p-3 rounded-xl ${mcpConnected ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
            <Cpu className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs text-slate-400 font-medium">Windows-MCP</div>
            <div className="text-sm font-semibold text-white flex items-center gap-1.5 mt-0.5">
              <span className={`w-2 h-2 rounded-full ${mcpConnected ? 'bg-emerald-400' : 'bg-rose-400'}`}></span>
              {mcpConnected ? 'Connected (Stdio)' : 'Disconnected'}
            </div>
          </div>
        </div>

        <div className="glass-panel p-4 flex items-center gap-4">
          <div className={`p-3 rounded-xl ${browserConnected ? 'bg-cyan-500/10 text-cyan-400' : 'bg-rose-500/10 text-rose-400'}`}>
            <Globe className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs text-slate-400 font-medium">Browser Engine</div>
            <div className="text-sm font-semibold text-white flex items-center gap-1.5 mt-0.5">
              <span className={`w-2 h-2 rounded-full ${browserConnected ? 'bg-cyan-400' : 'bg-rose-400'}`}></span>
              {browserConnected ? 'Playwright (Active)' : 'Offline'}
            </div>
          </div>
        </div>

        <div className="glass-panel p-4 flex items-center gap-4">
          <div className="p-3 rounded-xl bg-purple-500/10 text-purple-400">
            <Activity className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs text-slate-400 font-medium">Reasoning Engine</div>
            <div className="text-sm font-semibold text-white flex items-center gap-1.5 mt-0.5">
              <span className="w-2 h-2 rounded-full bg-purple-400"></span>
              Deterministic QA v1
            </div>
          </div>
        </div>

        <div className="glass-panel p-4 flex items-center gap-4">
          <div className="p-3 rounded-xl bg-amber-500/10 text-amber-400">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs text-slate-400 font-medium">Execution Mode</div>
            <div className="text-sm font-semibold text-amber-300 mt-0.5">
              {executionMode}
            </div>
          </div>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <div className="glass-panel p-5">
          <div className="flex justify-between items-center text-slate-400 text-xs">
            <span>Tasks Recorded</span>
            <Activity className="w-4 h-4 text-blue-400" />
          </div>
          <div className="text-2xl font-bold text-white mt-2">{metrics.taskCount}</div>
        </div>

        <div className="glass-panel p-5">
          <div className="flex justify-between items-center text-slate-400 text-xs">
            <span>Active Runs</span>
            <Play className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold text-emerald-400 mt-2">{metrics.activeRuns}</div>
        </div>

        <div className="glass-panel p-5">
          <div className="flex justify-between items-center text-slate-400 text-xs">
            <span>Pending Reviews</span>
            <AlertTriangle className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-bold text-amber-400 mt-2">{metrics.pendingReviews}</div>
        </div>

        <div className="glass-panel p-5">
          <div className="flex justify-between items-center text-slate-400 text-xs">
            <span>Bugs Detected</span>
            <AlertTriangle className="w-4 h-4 text-rose-400" />
          </div>
          <div className="text-2xl font-bold text-rose-400 mt-2">{metrics.bugCount}</div>
        </div>

        <div className="glass-panel p-5">
          <div className="flex justify-between items-center text-slate-400 text-xs">
            <span>Reports Generated</span>
            <FileText className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-2xl font-bold text-purple-400 mt-2">{metrics.reportCount}</div>
        </div>
      </div>

      {/* Target & Verification Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="glass-panel p-6 space-y-4">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <span>🎯</span> Authorized Target Environment
          </h2>
          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-400">Target Application:</span>
              <span className="text-blue-400 font-mono">Demo Testing Lab (Port 4173)</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Authorization Scope:</span>
              <span className="text-emerald-400">Exploratory & Regression Verified</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Payment Restrictions:</span>
              <span className="text-rose-400 font-semibold">BLOCKED (No auto checkout)</span>
            </div>
          </div>
          <button 
            onClick={() => setTab('workspace')}
            className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-sm font-medium transition-colors"
          >
            Open Test Workspace
          </button>
        </div>

        <div className="glass-panel p-6 space-y-4">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <span>📋</span> Test IO Compliance & Rules
          </h2>
          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2 text-xs text-slate-300">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              <span>External platform `tester.test.io` is strictly blocked from auto-browsing</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              <span>No bypass of CAPTCHA, 2FA, or rate-limits permitted</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              <span>All bug reports are generated as DRAFT for human QA review</span>
            </div>
          </div>
          <button 
            onClick={() => setTab('reports')}
            className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-sm font-medium transition-colors"
          >
            Review Bug Report Drafts
          </button>
        </div>
      </div>
    </div>
  );
};
