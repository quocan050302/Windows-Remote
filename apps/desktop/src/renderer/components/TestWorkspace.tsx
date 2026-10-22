import React, { useState, useEffect } from 'react';
import { useStudioStore } from '../store';
import { apiClient } from '../api';
import { 
  Play, 
  Pause, 
  Square, 
  UserCheck, 
  CheckCircle, 
  AlertCircle, 
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Shield,
  Camera,
  Terminal,
  Globe,
  Radio,
  FileText,
  Cpu
} from 'lucide-react';

export const TestWorkspace: React.FC = () => {
  const { 
    agentStatus, 
    currentStep, 
    totalSteps, 
    activeStepGoal,
    activeAiRuntime,
    targetUrl, 
    isPaused, 
    isUserTakeover,
    candidateBugs,
    evidence,
    tasks,
    activeTaskId,
    activePlan,
    fetchPlan,
    liveScreenshotBase64,
    liveLogs,
    startRun, 
    pauseRun, 
    resumeRun, 
    stopRun, 
    triggerTakeover 
  } = useStudioStore();

  const [collapseLeft, setCollapseLeft] = useState(false);
  const [collapseRight, setCollapseRight] = useState(false);
  const [activeTabLogs, setActiveTabLogs] = useState<'logs' | 'bugs' | 'evidence'>('logs');

  // Find active task if any
  const currentTask = tasks.find((t) => t.id === activeTaskId) || tasks[0];

  useEffect(() => {
    if (activeTaskId) {
      fetchPlan(activeTaskId);
    }
  }, [activeTaskId, fetchPlan]);

  const handleOpenTargetExternal = async () => {
    try {
      await apiClient.openExternal(targetUrl);
    } catch (_) {
      window.open(targetUrl, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden bg-[#0a0e1a]">
      {/* Top Action Bar / Live Controls */}
      <div className="bg-[#101628] border-b border-slate-800 px-6 py-3 flex flex-wrap justify-between items-center gap-3 z-10">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <span className={`w-3 h-3 rounded-full ${
              agentStatus === 'RUNNING' ? 'bg-emerald-400 animate-pulse' :
              agentStatus === 'PAUSED' ? 'bg-amber-400' :
              agentStatus === 'CANCELLED' ? 'bg-rose-400' : 
              agentStatus === 'COMPLETED' ? 'bg-blue-400' : 'bg-slate-400'
            }`}></span>
            <span className="text-xs font-bold text-white tracking-wide uppercase">
              STATUS: {agentStatus}
            </span>
          </div>

          <span className="text-slate-600 hidden sm:inline">|</span>

          <div className="text-xs text-slate-400">
            Step <span className="text-white font-bold">{currentStep}</span> of {totalSteps || 4}
          </div>

          <span className="text-slate-600 hidden sm:inline">|</span>

          <div className="text-xs text-slate-400 flex items-center gap-1.5">
            <Shield className="w-3.5 h-3.5 text-blue-400" />
            Target: <span className="font-mono text-blue-300">{targetUrl}</span>
          </div>

          <span className="text-slate-600 hidden md:inline">|</span>

          <div className="text-xs text-slate-400 flex items-center gap-1.5 hidden md:flex">
            <Cpu className="w-3.5 h-3.5 text-purple-400" />
            Reasoning Engine: <span className="text-slate-200 font-semibold">{activeAiRuntime?.providerName || 'Deterministic QA'}</span>
            <span className="font-mono text-emerald-400 text-[11px]">({activeAiRuntime?.modelId || 'qa-deterministic-v1'})</span>
          </div>
        </div>

        {/* Live Controls */}
        <div className="flex items-center gap-2">
          {agentStatus !== 'RUNNING' ? (
            <button 
              onClick={() => startRun(activeTaskId, targetUrl)}
              className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-all shadow-lg shadow-emerald-600/20"
            >
              <Play className="w-3.5 h-3.5 fill-white" /> Start Run
            </button>
          ) : isPaused ? (
            <button 
              onClick={resumeRun}
              className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-all shadow-lg shadow-emerald-600/20"
            >
              <Play className="w-3.5 h-3.5 fill-white" /> Resume
            </button>
          ) : (
            <button 
              onClick={pauseRun}
              className="flex items-center gap-1.5 bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-all shadow-lg shadow-amber-600/20"
            >
              <Pause className="w-3.5 h-3.5" /> Pause
            </button>
          )}

          <button 
            onClick={triggerTakeover}
            className={`flex items-center gap-1.5 text-xs font-semibold px-4 py-2 rounded-lg border transition-all ${
              isUserTakeover 
                ? 'bg-purple-600 border-purple-500 text-white shadow-lg shadow-purple-600/20' 
                : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200'
            }`}
            title="Temporarily freeze autonomous actions for direct human QA takeover"
          >
            <UserCheck className="w-3.5 h-3.5" /> {isUserTakeover ? 'Release Takeover' : 'Human Takeover'}
          </button>

          <button 
            onClick={stopRun}
            disabled={agentStatus !== 'RUNNING' && agentStatus !== 'PAUSED'}
            className="flex items-center gap-1.5 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-semibold px-4 py-2 rounded-lg transition-all shadow-lg shadow-rose-600/20"
          >
            <Square className="w-3.5 h-3.5 fill-white" /> Emergency Stop
          </button>
        </div>
      </div>

      {/* 3-Column Main Body */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Column: Requirements & Test Plan */}
        <div className={`border-r border-slate-800 bg-[#0d1222] transition-all duration-300 flex flex-col ${collapseLeft ? 'w-12' : 'w-80'}`}>
          <div className="p-3 border-b border-slate-800 flex justify-between items-center">
            {!collapseLeft && <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">Plan & Scope</span>}
            <button onClick={() => setCollapseLeft(!collapseLeft)} className="p-1 hover:bg-slate-800 rounded text-slate-400">
              {collapseLeft ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
            </button>
          </div>

          {!collapseLeft && (
            <div className="p-4 space-y-4 overflow-y-auto flex-1 text-sm">
              <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 space-y-1.5">
                <div className="text-xs font-semibold text-blue-400 uppercase tracking-wider">ACTIVE TASK BRIEF</div>
                <div className="text-xs font-bold text-white">{currentTask?.title || 'Autonomous Verification Flow'}</div>
                <div className="text-[11px] text-slate-400 leading-relaxed">{currentTask?.description || 'Testing interactive application flows on authorized target.'}</div>
              </div>

              <div className="p-3 rounded-lg bg-rose-950/20 border border-rose-900/40 space-y-1">
                <div className="text-xs font-semibold text-rose-400 uppercase tracking-wider">OUT-OF-SCOPE BOUNDARIES</div>
                <div className="text-xs text-rose-300/80 leading-relaxed">
                  {activePlan?.outOfScopeBoundaries && activePlan.outOfScopeBoundaries.length > 0
                    ? activePlan.outOfScopeBoundaries.join(' • ')
                    : currentTask?.analysis?.outOfScopeFeatures && currentTask.analysis.outOfScopeFeatures.length > 0
                      ? currentTask.analysis.outOfScopeFeatures.join(' • ')
                      : 'No automated payment checkout. No access to tester.test.io or external production portals.'}
                </div>
              </div>

              {/* Dynamic Execution Step Tracker */}
              <div className="space-y-2 pt-1">
                <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  EXECUTION SEQUENCE {activePlan ? `(${activePlan.steps.length} STEPS)` : ''}
                </div>
                <div className="space-y-2">
                  {(activePlan?.steps && activePlan.steps.length > 0
                    ? activePlan.steps.map((s) => {
                        const isBugOnStep = candidateBugs.some((b) => b.stepId === s.stepId);
                        const isStepDone = currentStep > s.stepNumber || agentStatus === 'COMPLETED';
                        const isStepActive = agentStatus === 'RUNNING' && currentStep === s.stepNumber;
                        const status = isBugOnStep ? 'BUG_DETECTED' : isStepDone ? 'DONE' : isStepActive ? 'ACTIVE' : 'PENDING';
                        return {
                          num: s.stepNumber,
                          title: s.goal,
                          stepStatus: status
                        };
                      })
                    : currentTask?.title?.includes('[DEMO]')
                      ? [
                          { num: 1, title: 'Navigate to target and inspect DOM elements', stepStatus: currentStep >= 1 ? (currentStep > 1 ? 'DONE' : 'ACTIVE') : 'PENDING' },
                          { num: 2, title: 'Add Product 1 to Shopping Cart', stepStatus: currentStep >= 2 ? (currentStep > 2 ? 'DONE' : 'ACTIVE') : 'PENDING' },
                          { num: 3, title: 'Add Product 2 to Shopping Cart', stepStatus: currentStep >= 3 ? (currentStep > 3 ? 'DONE' : 'ACTIVE') : 'PENDING' },
                          { num: 4, title: 'Open Cart Drawer & Assert Mathematical Total Calculation', stepStatus: candidateBugs.length > 0 ? 'BUG_DETECTED' : (currentStep >= 4 ? 'DONE' : 'PENDING') }
                        ]
                      : []
                  ).map((s) => (
                    <div key={s.num} className={`p-2.5 rounded-lg border text-xs flex items-start gap-2.5 transition-all ${
                      s.stepStatus === 'BUG_DETECTED' ? 'bg-rose-950/30 border-rose-500/40 text-rose-200' :
                      s.stepStatus === 'DONE' ? 'bg-slate-900/60 border-emerald-500/30 text-slate-200' :
                      s.stepStatus === 'ACTIVE' ? 'bg-blue-950/40 border-blue-500/50 text-blue-200' :
                      'bg-slate-900/20 border-slate-800 text-slate-500'
                    }`}>
                      <span className="font-mono font-bold text-slate-500">{s.num}.</span>
                      <div className="flex-1">
                        <div className="font-medium">{s.title}</div>
                        <div className="text-[10px] mt-1 font-semibold flex items-center gap-1">
                          {s.stepStatus === 'BUG_DETECTED' && <span className="text-rose-400 flex items-center gap-0.5"><AlertCircle className="w-3 h-3" /> BUG DETECTED</span>}
                          {s.stepStatus === 'DONE' && <span className="text-emerald-400 flex items-center gap-0.5"><CheckCircle className="w-3 h-3" /> VERIFIED</span>}
                          {s.stepStatus === 'ACTIVE' && <span className="text-blue-400 animate-pulse">RUNNING...</span>}
                          {s.stepStatus === 'PENDING' && <span className="text-slate-600">PENDING</span>}
                        </div>
                      </div>
                    </div>
                  ))}
                  {(!activePlan || !activePlan.steps.length) && !currentTask?.title?.includes('[DEMO]') && (
                    <div className="text-xs text-slate-500 italic p-3 border border-slate-800 rounded-lg">
                      Test plan will be dynamically generated upon launching the test run.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Center Column: REAL Playwright Session Viewer */}
        <div className="flex-1 flex flex-col bg-[#060911] overflow-hidden">
          {/* Browser Address & Session Bar */}
          <div className="bg-[#121829] border-b border-slate-800 px-4 py-2 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className={`w-2.5 h-2.5 rounded-full ${agentStatus === 'RUNNING' ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`}></span>
              <span className="text-xs font-semibold text-slate-300">
                Playwright Session {agentStatus === 'RUNNING' ? '(Active Engine)' : '(Standby)'}
              </span>
            </div>

            <div className="flex-1 max-w-xl bg-[#0b0f19] border border-slate-800 rounded-md px-3 py-1 text-xs font-mono text-slate-300 flex items-center justify-between">
              <span className="truncate">{targetUrl}</span>
              <button 
                onClick={handleOpenTargetExternal}
                className="text-slate-500 hover:text-blue-400 p-0.5 rounded transition-colors ml-2 flex-shrink-0"
                title="Open in external browser"
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="flex items-center gap-1 text-[11px] text-slate-400 font-mono">
              <span>1280x800</span>
            </div>
          </div>

          {/* Real Playwright Session Viewport */}
          <div className="flex-1 relative flex items-center justify-center p-4 bg-[#070b14] overflow-hidden">
            {liveScreenshotBase64 ? (
              <div className="relative w-full h-full flex items-center justify-center">
                {/* Live stream badge */}
                <div className="absolute top-3 left-3 bg-black/70 backdrop-blur-md border border-slate-700 text-xs px-2.5 py-1 rounded-full text-slate-200 flex items-center gap-2 z-10">
                  <Radio className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
                  <span>PLAYWRIGHT SCREENSHOT STREAM</span>
                </div>

                <img 
                  src={`data:image/jpeg;base64,${liveScreenshotBase64}`} 
                  alt="Playwright Remote Viewport"
                  className="max-w-full max-h-full object-contain rounded-lg border border-slate-800 shadow-2xl"
                />
              </div>
            ) : (
              <div className="text-center space-y-4 max-w-md p-8 glass-panel border border-slate-800">
                <Globe className="w-12 h-12 text-blue-400/80 mx-auto animate-pulse" />
                <div className="space-y-1">
                  <h3 className="text-base font-bold text-white">Playwright Headless Engine Ready</h3>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Click <b className="text-emerald-400">Start Run</b> above to launch an authorized Chromium session against <span className="font-mono text-blue-300">{targetUrl}</span>.
                  </p>
                </div>
                <div className="text-[11px] text-slate-500 font-mono">
                  Playwright v1.50+ • Isolated Context • Strict Policy Engine Guard
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Reasoning, Logs & Evidence */}
        <div className={`border-l border-slate-800 bg-[#0d1222] transition-all duration-300 flex flex-col ${collapseRight ? 'w-12' : 'w-96'}`}>
          <div className="p-3 border-b border-slate-800 flex justify-between items-center">
            {!collapseRight && (
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => setActiveTabLogs('logs')}
                  className={`text-xs font-bold px-2 py-1 rounded transition-colors ${activeTabLogs === 'logs' ? 'bg-blue-600/30 text-blue-300' : 'text-slate-400 hover:text-slate-200'}`}
                >
                  Logs
                </button>
                <button 
                  onClick={() => setActiveTabLogs('bugs')}
                  className={`text-xs font-bold px-2 py-1 rounded transition-colors ${activeTabLogs === 'bugs' ? 'bg-rose-600/30 text-rose-300' : 'text-slate-400 hover:text-slate-200'}`}
                >
                  Bugs ({candidateBugs.length})
                </button>
                <button 
                  onClick={() => setActiveTabLogs('evidence')}
                  className={`text-xs font-bold px-2 py-1 rounded transition-colors ${activeTabLogs === 'evidence' ? 'bg-emerald-600/30 text-emerald-300' : 'text-slate-400 hover:text-slate-200'}`}
                >
                  Evidence ({evidence.length})
                </button>
              </div>
            )}
            <button onClick={() => setCollapseRight(!collapseRight)} className="p-1 hover:bg-slate-800 rounded text-slate-400">
              {collapseRight ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </button>
          </div>

          {!collapseRight && (
            <div className="p-4 space-y-4 overflow-y-auto flex-1 text-xs">
              {/* Active Step Reasoning Box */}
              <div className="p-3 rounded-lg bg-blue-950/20 border border-blue-500/30 space-y-1.5">
                <div className="font-semibold text-blue-400 flex items-center gap-1.5">
                  <span>🧠</span> Active Step Reasoning
                </div>
                <p className="text-slate-300 leading-relaxed font-mono text-[11px]">
                  {activeStepGoal 
                    ? `Executing: ${activeStepGoal}` 
                    : agentStatus === 'RUNNING' 
                      ? 'Observing DOM tree and evaluating interactive controls...' 
                      : 'Agent idle. Ready for task execution.'}
                </p>
              </div>

              {activeTabLogs === 'logs' && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-slate-400 uppercase tracking-wider font-bold text-[10px]">
                    <span className="flex items-center gap-1.5"><Terminal className="w-3.5 h-3.5" /> Live Execution Logs</span>
                    <span className="text-slate-600">{liveLogs.length} events</span>
                  </div>

                  <div className="bg-[#050811] border border-slate-800 rounded-lg p-3 font-mono text-[11px] space-y-1.5 max-h-[360px] overflow-y-auto">
                    {liveLogs.length === 0 ? (
                      <div className="text-slate-600 italic">No execution events yet...</div>
                    ) : (
                      liveLogs.map((log, idx) => (
                        <div key={idx} className={`leading-relaxed ${
                          log.includes('BUG DETECTED') ? 'text-rose-400 font-semibold' :
                          log.includes('VERIFIED') ? 'text-emerald-400' :
                          log.includes('BLOCKED') ? 'text-amber-400' : 'text-slate-300'
                        }`}>
                          {log}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {activeTabLogs === 'bugs' && (
                <div className="space-y-3">
                  <div className="text-slate-400 uppercase tracking-wider font-bold text-[10px]">
                    Candidate Bugs Identified
                  </div>

                  {candidateBugs.length === 0 ? (
                    <div className="text-slate-500 italic p-4 text-center glass-panel">
                      No defects detected yet.
                    </div>
                  ) : (
                    candidateBugs.map((b, idx) => (
                      <div key={b.id || idx} className="p-3 rounded-lg bg-rose-950/30 border border-rose-500/40 space-y-2">
                        <div className="font-bold text-rose-400 flex items-center gap-1.5">
                          <AlertCircle className="w-4 h-4 flex-shrink-0" />
                          <span>Candidate Bug #{idx + 1}</span>
                          <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-rose-900/40 text-rose-300 font-mono">
                            {b.severity}
                          </span>
                        </div>
                        <div className="text-slate-200 font-semibold">{b.title}</div>
                        <div className="text-slate-400 text-[11px]">
                          <div><b>Actual:</b> {b.actualResult}</div>
                          <div><b>Expected:</b> {b.expectedResult}</div>
                        </div>
                        <div className="text-[10px] text-slate-500 font-mono">
                          Status: {b.reproductionStatus || 'REPRODUCED'}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {activeTabLogs === 'evidence' && (
                <div className="space-y-3">
                  <div className="text-slate-400 uppercase tracking-wider font-bold text-[10px] flex items-center justify-between">
                    <span className="flex items-center gap-1.5"><Camera className="w-3.5 h-3.5" /> Captured Verification Evidence</span>
                    <span className="text-slate-600">{evidence.length} items</span>
                  </div>

                  {evidence.length === 0 ? (
                    <div className="text-slate-500 italic p-4 text-center glass-panel">
                      No evidence captured yet. Screenshots and DOM snapshots are saved automatically during test execution.
                    </div>
                  ) : (
                    evidence.map((ev, idx) => (
                      <div key={ev.id || idx} className="p-3 rounded-lg bg-slate-900 border border-slate-800 space-y-1.5 font-mono text-[11px]">
                        <div className="flex items-center justify-between text-slate-300 font-bold">
                          <span className="text-emerald-400">#{idx + 1} {ev.type}</span>
                          <span className="text-slate-500 text-[10px]">{ev.stepId || 'General'}</span>
                        </div>
                        <div className="text-slate-400 break-all text-[10px] space-y-0.5">
                          <div><b className="text-slate-300">File:</b> {ev.filePath}</div>
                          <div><b className="text-slate-300">SHA-256:</b> <span className="text-blue-300 font-mono">{ev.sha256Hash}</span></div>
                          <div className="text-slate-500">{new Date(ev.timestamp).toLocaleTimeString()}</div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
