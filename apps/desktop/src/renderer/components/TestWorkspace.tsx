import React, { useState } from 'react';
import { useStudioStore } from '../store';
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
  Camera
} from 'lucide-react';

export const TestWorkspace: React.FC = () => {
  const { 
    agentStatus, 
    currentStep, 
    totalSteps, 
    targetUrl, 
    isPaused, 
    isUserTakeover,
    startRun, 
    pauseRun, 
    resumeRun, 
    stopRun, 
    triggerTakeover 
  } = useStudioStore();

  const [collapseLeft, setCollapseLeft] = useState(false);
  const [collapseRight, setCollapseRight] = useState(false);

  const steps = [
    { num: 1, title: 'Navigate to target and inspect DOM', status: currentStep >= 1 ? 'DONE' : 'PENDING' },
    { num: 2, title: 'Add Product 1 (Keyboard $29.99) to Cart', status: currentStep >= 2 ? 'DONE' : 'PENDING' },
    { num: 3, title: 'Add Product 2 (Mouse $49.99) to Cart', status: currentStep >= 3 ? 'DONE' : 'PENDING' },
    { num: 4, title: 'Open Cart Drawer & Assert Total Calculation ($79.98)', status: currentStep >= 4 ? 'FAILED' : 'PENDING' }
  ];

  return (
    <div className="flex flex-col h-full overflow-hidden bg-[#0a0e1a]">
      {/* Top Action Bar / Live Controls */}
      <div className="bg-[#101628] border-b border-slate-800 px-6 py-3 flex justify-between items-center z-10">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className={`w-3 h-3 rounded-full ${
              agentStatus === 'RUNNING' ? 'bg-emerald-400 animate-ping' :
              agentStatus === 'PAUSED' ? 'bg-amber-400' :
              agentStatus === 'CANCELLED' ? 'bg-rose-400' : 'bg-blue-400'
            }`}></span>
            <span className="text-sm font-semibold text-white tracking-wide">STATUS: {agentStatus}</span>
          </div>
          <span className="text-slate-600">|</span>
          <div className="text-xs text-slate-400">
            Step <span className="text-white font-bold">{currentStep}</span> of {totalSteps}
          </div>
          <span className="text-slate-600">|</span>
          <div className="text-xs text-slate-400 flex items-center gap-1.5">
            <Shield className="w-3.5 h-3.5 text-blue-400" />
            Target: <span className="font-mono text-blue-300">{targetUrl}</span>
          </div>
        </div>

        {/* Live Controls */}
        <div className="flex items-center gap-2">
          {agentStatus !== 'RUNNING' ? (
            <button 
              onClick={() => startRun()}
              className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-all"
            >
              <Play className="w-3.5 h-3.5 fill-white" /> Start Run
            </button>
          ) : isPaused ? (
            <button 
              onClick={resumeRun}
              className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-all"
            >
              <Play className="w-3.5 h-3.5 fill-white" /> Resume
            </button>
          ) : (
            <button 
              onClick={pauseRun}
              className="flex items-center gap-1.5 bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-all"
            >
              <Pause className="w-3.5 h-3.5" /> Pause
            </button>
          )}

          <button 
            onClick={triggerTakeover}
            className={`flex items-center gap-1.5 text-xs font-semibold px-4 py-2 rounded-lg border transition-all ${
              isUserTakeover 
                ? 'bg-purple-600 border-purple-500 text-white' 
                : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200'
            }`}
          >
            <UserCheck className="w-3.5 h-3.5" /> Human Takeover
          </button>

          <button 
            onClick={stopRun}
            className="flex items-center gap-1.5 bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-all"
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
              <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 space-y-2">
                <div className="text-xs font-semibold text-blue-400">IN-SCOPE FEATURES</div>
                <ul className="text-xs text-slate-300 list-disc list-inside space-y-1">
                  <li>Shopping cart addition</li>
                  <li>Cart drawer inspection</li>
                  <li>Total price calculation check</li>
                </ul>
              </div>

              <div className="p-3 rounded-lg bg-rose-950/20 border border-rose-900/40 space-y-1">
                <div className="text-xs font-semibold text-rose-400">OUT-OF-SCOPE</div>
                <div className="text-xs text-rose-300/80">No actual financial transactions or payment completion.</div>
              </div>

              <div className="space-y-2 pt-2">
                <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">EXECUTION STEPS</div>
                <div className="space-y-2">
                  {steps.map((s) => (
                    <div key={s.num} className={`p-2.5 rounded-lg border text-xs flex items-start gap-2.5 ${
                      s.status === 'DONE' ? 'bg-slate-900/40 border-emerald-500/30 text-slate-200' :
                      s.status === 'FAILED' ? 'bg-rose-950/30 border-rose-500/40 text-rose-200' :
                      'bg-slate-900/20 border-slate-800 text-slate-400'
                    }`}>
                      <span className="font-mono font-bold text-slate-500">{s.num}.</span>
                      <div className="flex-1">
                        <div>{s.title}</div>
                        <div className="text-[10px] mt-1 font-semibold flex items-center gap-1">
                          {s.status === 'DONE' && <span className="text-emerald-400 flex items-center gap-0.5"><CheckCircle className="w-3 h-3" /> VERIFIED</span>}
                          {s.status === 'FAILED' && <span className="text-rose-400 flex items-center gap-0.5"><AlertCircle className="w-3 h-3" /> BUG DETECTED</span>}
                          {s.status === 'PENDING' && <span className="text-slate-500">PENDING</span>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Center Column: Live Browser View */}
        <div className="flex-1 flex flex-col bg-[#060911] overflow-hidden">
          {/* Browser Address Bar */}
          <div className="bg-[#121829] border-b border-slate-800 px-4 py-2 flex items-center gap-3">
            <div className="flex gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500"></span>
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
            </div>
            <div className="flex-1 bg-[#0b0f19] border border-slate-800 rounded-md px-3 py-1 text-xs font-mono text-slate-300 flex items-center justify-between">
              <span>{targetUrl}</span>
              <ExternalLink className="w-3 h-3 text-slate-500" />
            </div>
          </div>

          {/* Browser Frame */}
          <div className="flex-1 relative flex items-center justify-center p-4">
            <iframe 
              src={targetUrl}
              title="Live Browser Target"
              className="w-full h-full rounded-xl border border-slate-800 shadow-2xl bg-[#090d16]"
            />
          </div>
        </div>

        {/* Right Column: Reasoning, Logs & Evidence */}
        <div className={`border-l border-slate-800 bg-[#0d1222] transition-all duration-300 flex flex-col ${collapseRight ? 'w-12' : 'w-96'}`}>
          <div className="p-3 border-b border-slate-800 flex justify-between items-center">
            {!collapseRight && <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">AI Reasoning & Evidence</span>}
            <button onClick={() => setCollapseRight(!collapseRight)} className="p-1 hover:bg-slate-800 rounded text-slate-400">
              {collapseRight ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </button>
          </div>

          {!collapseRight && (
            <div className="p-4 space-y-4 overflow-y-auto flex-1 text-xs">
              <div className="p-3 rounded-lg bg-blue-950/20 border border-blue-500/30 space-y-1.5">
                <div className="font-semibold text-blue-400 flex items-center gap-1.5">
                  <span>🧠</span> Active Step Reasoning
                </div>
                <p className="text-slate-300 leading-relaxed">
                  Observed shopping cart total displayed as <b className="text-white">$29.99</b> after adding 2 items ($29.99 + $49.99). Expected mathematical sum is <b className="text-white">$79.98</b>. Defect detected in cart total accumulator.
                </p>
              </div>

              <div className="p-3 rounded-lg bg-rose-950/30 border border-rose-500/40 space-y-2">
                <div className="font-bold text-rose-400 flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4" /> Candidate Bug #1
                </div>
                <div className="text-slate-200 font-semibold">[Cart] Total price mismatch on cart drawer</div>
                <div className="text-slate-400">Actual: $29.99 | Expected: $79.98</div>
                <div className="text-[10px] text-slate-500 font-mono">Status: READY_FOR_HUMAN_SUBMISSION</div>
              </div>

              <div className="space-y-2">
                <div className="font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Camera className="w-3.5 h-3.5" /> Captured Evidence (SHA-256)
                </div>
                <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 space-y-1 font-mono text-[10px]">
                  <div className="text-slate-300 font-semibold">step_4_cart_defect.png</div>
                  <div className="text-slate-500 break-all">SHA: ef5097a16c81fe63c246cef21c4ea346e...</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
