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
  ShieldAlert,
  ShieldCheck,
  Camera,
  Terminal,
  Globe,
  Radio,
  FileText,
  Cpu,
  Lock,
  PlusCircle,
  X,
  Monitor,
  RefreshCw,
  Check
} from 'lucide-react';
import type { CreateAuthorizationDto } from '@test-io-agent/shared';

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
    triggerTakeover,
    targetAuthorization,
    evaluateTargetAuthorization,
    createAuthorization,
    coverageMatrix,
    blockerReason,
    providerUsed,
    modelUsed,
    browserMode,
    controlOwnership,
    canResume,
    isVerifyingPage,
    checkPageResult,
    focusTestingBrowser,
    checkPageAgain,
    resumeAfterHumanVerification
  } = useStudioStore();

  const [focusFeedback, setFocusFeedback] = useState<string | null>(null);
  const [resumingLoading, setResumingLoading] = useState(false);

  const [collapseLeft, setCollapseLeft] = useState(false);
  const [collapseRight, setCollapseRight] = useState(false);
  const [activeTabLogs, setActiveTabLogs] = useState<'logs' | 'bugs' | 'evidence'>('logs');
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isAuthorizing, setIsAuthorizing] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Form states for authorization modal
  const [authDomain, setAuthDomain] = useState('');
  const [authGrantingParty, setAuthGrantingParty] = useState('Customer / Product Owner');
  const [authScope, setAuthScope] = useState('Autonomous Exploratory QA & Regression Testing');
  const [authExpiresInDays, setAuthExpiresInDays] = useState('30');
  const [authAllowedActions, setAuthAllowedActions] = useState<string[]>(['click', 'fill', 'navigate', 'scroll']);

  // Find active task if any
  const currentTask = tasks.find((t) => t.id === activeTaskId) || tasks[0];

  useEffect(() => {
    if (activeTaskId) {
      fetchPlan(activeTaskId);
    }
  }, [activeTaskId, fetchPlan]);

  useEffect(() => {
    evaluateTargetAuthorization(targetUrl);
    try {
      const u = new URL(targetUrl);
      setAuthDomain(u.hostname);
    } catch (_) {}
  }, [targetUrl, evaluateTargetAuthorization]);

  const handleOpenTargetExternal = async () => {
    try {
      await apiClient.openExternal(targetUrl);
    } catch (_) {
      window.open(targetUrl, '_blank', 'noopener,noreferrer');
    }
  };

  const handleCreateAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authDomain.trim() || !authGrantingParty.trim()) {
      setAuthError('Domain and Granting Party are required.');
      return;
    }
    setAuthError(null);
    setIsAuthorizing(true);
    try {
      const expiresInDays = parseInt(authExpiresInDays, 10);
      const expiresAt = expiresInDays > 0 
        ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString() 
        : undefined;

      const dto: CreateAuthorizationDto = {
        domain: authDomain.trim(),
        grantingParty: authGrantingParty.trim(),
        scope: authScope.trim(),
        allowedActions: authAllowedActions,
        expiresAt
      };

      const res = await createAuthorization(dto);
      if (res) {
        setIsAuthModalOpen(false);
        await evaluateTargetAuthorization(targetUrl);
      } else {
        setAuthError('Failed to create authorization record.');
      }
    } catch (err: any) {
      setAuthError(err.message || 'Error creating authorization');
    } finally {
      setIsAuthorizing(false);
    }
  };

  const toggleAction = (action: string) => {
    setAuthAllowedActions(prev => 
      prev.includes(action) ? prev.filter(a => a !== action) : [...prev, action]
    );
  };

  const handleFocusBrowser = async () => {
    try {
      const res = await focusTestingBrowser();
      if (res.focused) {
        setFocusFeedback(res.osLevelFocusAchieved ? 'Testing browser focused!' : (res.message || 'Chromium window brought forward. Check taskbar if not visible.'));
      } else {
        setFocusFeedback(res.message || 'Could not focus browser. Please click the Chromium icon in your taskbar.');
      }
      setTimeout(() => setFocusFeedback(null), 4000);
    } catch (e: any) {
      setFocusFeedback(e.message || 'Error focusing browser');
      setTimeout(() => setFocusFeedback(null), 4000);
    }
  };

  const handleResumeVerification = async () => {
    setResumingLoading(true);
    try {
      await resumeAfterHumanVerification();
    } catch (e: any) {
      // Handled in store
    } finally {
      setResumingLoading(false);
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
              agentStatus === 'BLOCKED_SITE_VERIFICATION' ? 'bg-orange-500 ring-2 ring-orange-500/40' :
              agentStatus === 'BLOCKED_AUTHORIZATION' || agentStatus === 'BLOCKED' ? 'bg-amber-500 ring-2 ring-amber-500/30' :
              agentStatus === 'PARTIAL' ? 'bg-yellow-400' :
              agentStatus === 'COMPLETED_WITH_FINDINGS' ? 'bg-indigo-400' :
              agentStatus === 'NEEDS_REVIEW' ? 'bg-purple-400' :
              agentStatus === 'CANCELLED' ? 'bg-rose-400' : 
              agentStatus === 'FAILED' ? 'bg-red-500' :
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

          {/* Authorization Status Badge */}
          {targetAuthorization?.isTestIo ? (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-rose-950/40 border border-rose-500/40 text-[11px] font-semibold text-rose-300" title="Test IO platform portal is strictly prohibited from autonomous execution">
              <ShieldAlert className="w-3.5 h-3.5 text-rose-400" /> Test IO Protected (No Automation)
            </div>
          ) : targetAuthorization?.authorized ? (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-950/40 border border-emerald-500/40 text-[11px] font-semibold text-emerald-300">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" /> Authorized Target
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-amber-950/40 border border-amber-500/40 text-[11px] font-semibold text-amber-300">
                <Lock className="w-3 h-3 text-amber-400" /> Authorization Required
              </span>
              <button
                onClick={() => setIsAuthModalOpen(true)}
                className="text-[11px] text-blue-400 hover:text-blue-300 underline font-medium"
              >
                Authorize
              </button>
            </div>
          )}

          <span className="text-slate-600 hidden md:inline">|</span>

          {/* Browser Mode Status Indicator */}
          <div className="flex items-center gap-1.5 text-xs">
            <Monitor className="w-3.5 h-3.5 text-cyan-400" />
            <span className="text-slate-400">Mode:</span>
            <span className={`px-2 py-0.5 rounded font-mono text-[10px] font-bold ${
              browserMode === 'VISIBLE_SUPERVISED' 
                ? 'bg-cyan-950/60 border border-cyan-500/40 text-cyan-300' 
                : browserMode === 'MANUAL_ONLY'
                ? 'bg-amber-950/60 border border-amber-500/40 text-amber-300'
                : 'bg-slate-800 border border-slate-700 text-slate-400'
            }`}>
              {browserMode === 'VISIBLE_SUPERVISED' ? 'Visible Browser' : browserMode === 'MANUAL_ONLY' ? 'Manual Control' : 'Headless Session'}
            </span>
          </div>

          <span className="text-slate-600 hidden lg:inline">|</span>

          {/* Control Ownership Indicator */}
          <div className="flex items-center gap-1.5 text-xs hidden lg:flex">
            <span className={`w-2 h-2 rounded-full ${controlOwnership === 'HUMAN' ? 'bg-purple-400 animate-pulse' : 'bg-emerald-400'}`}></span>
            <span className="text-slate-400">Ownership:</span>
            <span className={`font-semibold text-[11px] ${controlOwnership === 'HUMAN' ? 'text-purple-300' : 'text-emerald-300'}`}>
              {controlOwnership === 'HUMAN' ? 'Human Takeover' : 'AI Playwright'}
            </span>
          </div>

          <span className="text-slate-600 hidden md:inline">|</span>

          <div className="text-xs text-slate-400 flex items-center gap-1.5 hidden md:flex">
            <Cpu className="w-3.5 h-3.5 text-purple-400" />
            Reasoning Engine: <span className="text-slate-200 font-semibold">{providerUsed || activeAiRuntime?.providerName || 'Deterministic QA Engine'}</span>
            <span className="font-mono text-emerald-400 text-[11px]">({modelUsed || activeAiRuntime?.modelId || 'qa-deterministic-v1'})</span>
          </div>
        </div>

        {/* Live Controls: Open Website vs Start AI Test */}
        <div className="flex items-center gap-2">
          {/* Action 1: Manual Browser Viewing (No automation permission required) */}
          <button 
            onClick={handleOpenTargetExternal}
            className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold px-3.5 py-2 rounded-lg border border-slate-700 transition-all hover:text-white"
            title="Open website in your default browser for manual viewing"
          >
            <ExternalLink className="w-3.5 h-3.5 text-blue-400" /> Open Website
          </button>

          {/* Action 2: Start AI Test (Requires verified automation permission) */}
          {agentStatus !== 'RUNNING' && agentStatus !== 'AWAITING_HUMAN_VERIFICATION' && agentStatus !== 'HUMAN_CONTROL_ACTIVE' && agentStatus !== 'READY_TO_RESUME' ? (
            <button 
              onClick={() => startRun(activeTaskId, targetUrl)}
              className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-all shadow-lg shadow-emerald-600/20"
              title="Launch autonomous Playwright test loop (requires verified authorization)"
            >
              <Play className="w-3.5 h-3.5 fill-white" /> Start AI Test
            </button>
          ) : isPaused || agentStatus === 'READY_TO_RESUME' ? (
            <button 
              onClick={agentStatus === 'READY_TO_RESUME' ? handleResumeVerification : resumeRun}
              disabled={agentStatus === 'READY_TO_RESUME' && !canResume}
              className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-semibold px-4 py-2 rounded-lg transition-all shadow-lg shadow-emerald-600/20"
              title={agentStatus === 'READY_TO_RESUME' && !canResume ? 'Verification must be completed first' : 'Resume AI test execution'}
            >
              <Play className="w-3.5 h-3.5 fill-white" /> {resumingLoading ? 'Resuming...' : 'Resume AI Testing'}
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
              isUserTakeover || controlOwnership === 'HUMAN'
                ? 'bg-purple-600 border-purple-500 text-white shadow-lg shadow-purple-600/20' 
                : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200'
            }`}
            title="Temporarily freeze autonomous Playwright actions for direct human QA takeover"
          >
            <UserCheck className="w-3.5 h-3.5" /> {isUserTakeover || controlOwnership === 'HUMAN' ? 'Release Control' : 'Human Takeover'}
          </button>

          <button 
            onClick={stopRun}
            disabled={!['RUNNING', 'PAUSED', 'AWAITING_HUMAN_VERIFICATION', 'HUMAN_CONTROL_ACTIVE', 'READY_TO_RESUME', 'VERIFYING_PAGE_ACCESS'].includes(agentStatus)}
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

              {/* Requirements Coverage Matrix Summary */}
              {coverageMatrix && (
                <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 space-y-2 text-xs">
                  <div className="font-semibold text-blue-400 uppercase tracking-wider flex justify-between items-center">
                    <span>Coverage Matrix</span>
                    <span className="font-mono text-emerald-400 font-bold">{coverageMatrix.coveragePercentage}%</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div className="text-slate-400">Total Reqs: <b className="text-white font-mono">{coverageMatrix.totalRequirements}</b></div>
                    <div className="text-slate-400">Covered: <b className="text-emerald-400 font-mono">{coverageMatrix.coveredRequirements}</b></div>
                    <div className="text-slate-400">Passed: <b className="text-emerald-400 font-mono">{coverageMatrix.passedScenarios}</b></div>
                    <div className="text-slate-400">Failed: <b className="text-rose-400 font-mono">{coverageMatrix.failedScenarios}</b></div>
                    <div className="text-slate-400">Blocked: <b className="text-orange-400 font-mono">{coverageMatrix.blockedScenarios}</b></div>
                    <div className="text-slate-400">Unverified: <b className="text-amber-400 font-mono">{coverageMatrix.unverifiedScenarios}</b></div>
                  </div>
                  {coverageMatrix.uncoveredRequirements.length > 0 && (
                    <div className="text-[10px] text-amber-300/80 pt-1 border-t border-slate-800">
                      Uncovered: {coverageMatrix.uncoveredRequirements.map(u => u.title).join(', ')}
                    </div>
                  )}
                </div>
              )}

              {/* Dynamic Execution Scenarios Tracker */}
              <div className="space-y-2 pt-1">
                <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  TEST SCENARIOS {coverageMatrix?.scenarioMappings?.length ? `(${coverageMatrix.scenarioMappings.length})` : activePlan ? `(${activePlan.steps.length} STEPS)` : ''}
                </div>
                <div className="space-y-2">
                  {coverageMatrix?.scenarioMappings && coverageMatrix.scenarioMappings.length > 0 ? (
                    coverageMatrix.scenarioMappings.map((sc, idx) => (
                      <div key={sc.scenarioId || idx} className={`p-2.5 rounded-lg border text-xs space-y-1.5 transition-all ${
                        sc.verificationStatus === 'PASS' ? 'bg-slate-900/60 border-emerald-500/30 text-slate-200' :
                        sc.verificationStatus === 'FAIL' ? 'bg-rose-950/30 border-rose-500/40 text-rose-200' :
                        sc.verificationStatus === 'BLOCKED' ? 'bg-orange-950/30 border-orange-500/40 text-orange-200' :
                        sc.verificationStatus === 'UNVERIFIED' ? 'bg-amber-950/30 border-amber-500/40 text-amber-200' :
                        'bg-slate-900/20 border-slate-800 text-slate-400'
                      }`}>
                        <div className="flex items-center justify-between">
                          <span className="font-mono font-bold text-slate-400">#{idx + 1} {sc.requirementCategory}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono uppercase font-bold ${
                            sc.verificationStatus === 'PASS' ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-500/40' :
                            sc.verificationStatus === 'FAIL' ? 'bg-rose-950/80 text-rose-300 border border-rose-500/40' :
                            sc.verificationStatus === 'BLOCKED' ? 'bg-orange-950/80 text-orange-300 border border-orange-500/40' :
                            sc.verificationStatus === 'UNVERIFIED' ? 'bg-amber-950/80 text-amber-300 border border-amber-500/40' :
                            'bg-slate-800 text-slate-400'
                          }`}>
                            {sc.verificationStatus || sc.executionStatus}
                          </span>
                        </div>
                        <div className="font-medium text-white">{sc.objective}</div>
                        <div className="text-[10px] text-slate-400 space-y-0.5">
                          <div><b className="text-slate-300">Target:</b> <span className="font-mono text-cyan-300">{sc.targetControl}</span></div>
                          <div><b className="text-slate-300">Expected:</b> {sc.expectedBehavior}</div>
                          {sc.blockerReason && <div className="text-orange-400"><b>Blocker:</b> {sc.blockerReason}</div>}
                        </div>
                      </div>
                    ))
                  ) : (activePlan?.steps && activePlan.steps.length > 0
                    ? activePlan.steps.map((s) => {
                        const isBugOnStep = candidateBugs.some((b) => b.stepId === s.stepId);
                        const isStepActive = agentStatus === 'RUNNING' && currentStep === s.stepNumber;
                        const isPastStep = currentStep > s.stepNumber || agentStatus === 'COMPLETED' || agentStatus === 'PARTIAL' || agentStatus === 'COMPLETED_WITH_FINDINGS';
                        const status = isBugOnStep ? 'BUG_DETECTED' : isStepActive ? 'ACTIVE' : isPastStep ? 'EXECUTED' : 'PENDING';
                        return {
                          num: s.stepNumber,
                          title: s.goal,
                          stepStatus: status
                        };
                      })
                    : currentTask?.title?.includes('[DEMO]')
                      ? [
                          { num: 1, title: 'Navigate to target and inspect DOM elements', stepStatus: currentStep >= 1 ? (currentStep > 1 ? 'EXECUTED' : 'ACTIVE') : 'PENDING' },
                          { num: 2, title: 'Add Product 1 to Shopping Cart', stepStatus: currentStep >= 2 ? (currentStep > 2 ? 'EXECUTED' : 'ACTIVE') : 'PENDING' },
                          { num: 3, title: 'Add Product 2 to Shopping Cart', stepStatus: currentStep >= 3 ? (currentStep > 3 ? 'EXECUTED' : 'ACTIVE') : 'PENDING' },
                          { num: 4, title: 'Open Cart Drawer & Assert Mathematical Total Calculation', stepStatus: candidateBugs.length > 0 ? 'BUG_DETECTED' : (currentStep >= 4 ? 'EXECUTED' : 'PENDING') }
                        ]
                      : []
                  ).map((s) => (
                    <div key={s.num} className={`p-2.5 rounded-lg border text-xs flex items-start gap-2.5 transition-all ${
                      s.stepStatus === 'BUG_DETECTED' ? 'bg-rose-950/30 border-rose-500/40 text-rose-200' :
                      s.stepStatus === 'EXECUTED' ? 'bg-slate-900/60 border-slate-700 text-slate-300' :
                      s.stepStatus === 'ACTIVE' ? 'bg-blue-950/40 border-blue-500/50 text-blue-200' :
                      'bg-slate-900/20 border-slate-800 text-slate-500'
                    }`}>
                      <span className="font-mono font-bold text-slate-500">{s.num}.</span>
                      <div className="flex-1">
                        <div className="font-medium">{s.title}</div>
                        <div className="text-[10px] mt-1 font-semibold flex items-center gap-1">
                          {s.stepStatus === 'BUG_DETECTED' && <span className="text-rose-400 flex items-center gap-0.5"><AlertCircle className="w-3 h-3" /> BUG DETECTED</span>}
                          {s.stepStatus === 'EXECUTED' && <span className="text-slate-400 flex items-center gap-0.5"><CheckCircle className="w-3 h-3" /> EXECUTED</span>}
                          {s.stepStatus === 'ACTIVE' && <span className="text-blue-400 animate-pulse">RUNNING...</span>}
                          {s.stepStatus === 'PENDING' && <span className="text-slate-600">PENDING</span>}
                        </div>
                      </div>
                    </div>
                  ))}
                  {(!activePlan || !activePlan.steps.length) && !currentTask?.title?.includes('[DEMO]') && !coverageMatrix?.scenarioMappings?.length && (
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
              <span className={`w-2.5 h-2.5 rounded-full ${
                agentStatus === 'RUNNING' ? 'bg-emerald-400 animate-pulse' :
                agentStatus === 'AWAITING_HUMAN_VERIFICATION' || agentStatus === 'HUMAN_CONTROL_ACTIVE' ? 'bg-amber-400 animate-pulse' :
                agentStatus === 'READY_TO_RESUME' ? 'bg-cyan-400' : 'bg-slate-500'
              }`}></span>
              <span className="text-xs font-semibold text-slate-300">
                Playwright Session {agentStatus === 'RUNNING' ? '(Active Engine)' : agentStatus === 'HUMAN_CONTROL_ACTIVE' ? '(Human Control Enabled)' : agentStatus === 'AWAITING_HUMAN_VERIFICATION' ? '(Awaiting Human Verification)' : '(Standby)'}
              </span>
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                browserMode === 'VISIBLE_SUPERVISED' 
                  ? 'bg-cyan-950/80 border border-cyan-500/40 text-cyan-300' 
                  : 'bg-slate-800 text-slate-400'
              }`}>
                {browserMode === 'VISIBLE_SUPERVISED' ? 'Visible Chromium' : 'Headless'}
              </span>
            </div>

            <div className="flex-1 max-w-xl bg-[#0b0f19] border border-slate-800 rounded-md px-3 py-1 text-xs font-mono text-slate-300 flex items-center justify-between">
              <span className="truncate">{targetUrl}</span>
              <div className="flex items-center gap-2 ml-2 flex-shrink-0">
                {browserMode === 'VISIBLE_SUPERVISED' && (
                  <button 
                    onClick={handleFocusBrowser}
                    className="flex items-center gap-1 text-[11px] text-cyan-400 hover:text-cyan-300 bg-cyan-950/60 border border-cyan-500/40 px-2 py-0.5 rounded transition-colors"
                    title="Bring the visible Playwright Chromium browser to the foreground"
                  >
                    <Monitor className="w-3 h-3" /> Focus
                  </button>
                )}
                <button 
                  onClick={handleOpenTargetExternal}
                  className="text-slate-500 hover:text-blue-400 p-0.5 rounded transition-colors"
                  title="Open in external browser"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2 text-[11px] text-slate-400 font-mono">
              {focusFeedback && (
                <span className="text-[10px] font-sans text-cyan-300 bg-cyan-950 px-2 py-0.5 rounded border border-cyan-800 animate-fade-in">
                  {focusFeedback}
                </span>
              )}
              <span>1280x800</span>
            </div>
          </div>

          {/* Real Playwright Session Viewport */}
          <div className="flex-1 relative flex items-center justify-center p-4 bg-[#070b14] overflow-hidden">
            {/* Human Verification State Panel: Awaiting, Human Active, Verifying, or Ready To Resume */}
            {(agentStatus === 'AWAITING_HUMAN_VERIFICATION' ||
              agentStatus === 'HUMAN_CONTROL_ACTIVE' ||
              agentStatus === 'VERIFYING_PAGE_ACCESS' ||
              agentStatus === 'READY_TO_RESUME' ||
              agentStatus === 'BLOCKED_SITE_VERIFICATION') ? (
              <div className="text-center space-y-4 max-w-2xl p-6 glass-panel border border-amber-500/50 bg-[#0d1326]/90 rounded-2xl shadow-2xl overflow-y-auto max-h-full">
                {/* Header Icon & Title */}
                <div className="flex items-center justify-center gap-3">
                  <ShieldAlert className="w-10 h-10 text-amber-400" />
                  <div className="text-left">
                    <h3 className="text-base font-bold text-white">Security Verification Required</h3>
                    <p className="text-xs text-amber-300/90">
                      The website is asking for human verification. Automated testing has been paused.
                    </p>
                  </div>
                </div>

                {/* Prominent Activity State Banner (Section 67) */}
                <div className={`p-2.5 rounded-lg border text-xs font-semibold flex items-center justify-between gap-2 text-left ${
                  agentStatus === 'READY_TO_RESUME' || canResume
                    ? 'bg-emerald-950/60 border-emerald-500/50 text-emerald-200'
                    : agentStatus === 'HUMAN_CONTROL_ACTIVE'
                    ? 'bg-purple-950/60 border-purple-500/50 text-purple-200'
                    : agentStatus === 'VERIFYING_PAGE_ACCESS' || isVerifyingPage
                    ? 'bg-blue-950/60 border-blue-500/50 text-blue-200'
                    : 'bg-amber-950/60 border-amber-500/50 text-amber-200'
                }`}>
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-current animate-pulse"></span>
                    <span>
                      {agentStatus === 'READY_TO_RESUME' || canResume
                        ? 'Application Ready! Verification confirmed. Safe to Resume AI Testing.'
                        : agentStatus === 'HUMAN_CONTROL_ACTIVE'
                        ? 'Human Control Active. Autonomous Playwright action scheduling is paused.'
                        : agentStatus === 'VERIFYING_PAGE_ACCESS' || isVerifyingPage
                        ? 'Checking page access and readiness in active browser session...'
                        : agentStatus === 'BLOCKED_SITE_VERIFICATION'
                        ? 'Verification still required. Security challenge remains detected.'
                        : 'Challenge Detected. Waiting for human verification in Chromium browser.'}
                    </span>
                  </div>
                  <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-black/40 border border-current">
                    {agentStatus}
                  </span>
                </div>

                {/* Step-by-Step Instructions Box (Section 38) */}
                <div className="bg-black/40 border border-slate-800 rounded-xl p-3.5 text-left text-xs space-y-2">
                  <div className="font-semibold text-slate-300 flex items-center gap-1.5 uppercase tracking-wider text-[11px]">
                    <span>📋</span> Recommended Human Action Workflow
                  </div>
                  <ol className="list-decimal list-inside space-y-1 text-slate-300 text-[11px] leading-relaxed">
                    <li>Click <b className="text-cyan-400">Open / Focus Testing Browser</b> to bring forward the real Chromium window.</li>
                    <li>Complete the verification challenge manually in the Chromium window if permitted.</li>
                    <li>Return here to Agent Studio and click <b className="text-blue-400">Check Page Again</b>.</li>
                    <li>Once application readiness is verified, click <b className="text-emerald-400">Resume AI Testing</b> to continue on the same session.</li>
                  </ol>
                </div>

                {/* Read-Only Diagnostic Screenshot Stream (Section 39 & 68) */}
                {liveScreenshotBase64 && (
                  <div className="border border-slate-800 rounded-lg overflow-hidden max-h-52 shadow-lg bg-black/60 relative">
                    <div className="absolute top-2 left-2 bg-black/80 backdrop-blur-md border border-amber-500/40 text-[10px] font-mono px-2 py-0.5 rounded text-amber-300 flex items-center gap-1.5 z-10">
                      <Camera className="w-3 h-3 text-amber-400" />
                      <span>DIAGNOSTIC — Security Challenge (Read-Only Stream)</span>
                    </div>
                    <img 
                      src={`data:image/jpeg;base64,${liveScreenshotBase64}`} 
                      alt="Diagnostic Challenge Screen"
                      className="w-full h-auto object-contain max-h-48 bg-black opacity-90"
                    />
                    <div className="bg-slate-900/90 py-1 px-3 text-[10px] font-mono text-slate-400 text-left border-t border-slate-800 flex justify-between">
                      <span>Live Browser Session Preserved • No Automated Bypass Attempted</span>
                      <span className="text-slate-500">Same Session Alive</span>
                    </div>
                  </div>
                )}

                {/* Action Buttons (Section 37, 63, 65, 66) */}
                <div className="flex flex-wrap items-center justify-center gap-2.5 pt-2">
                  {/* Button 1: Focus Testing Browser */}
                  <button
                    onClick={handleFocusBrowser}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-xs font-semibold text-white shadow-lg shadow-cyan-600/20 transition-all"
                    title="Bring forward the active Playwright Chromium browser"
                  >
                    <Monitor className="w-3.5 h-3.5" /> Open / Focus Testing Browser
                  </button>

                  {/* Button 2: Check Page Again */}
                  <button
                    onClick={() => checkPageAgain().catch(() => {})}
                    disabled={isVerifyingPage}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-xs font-semibold text-white shadow-lg shadow-blue-600/20 transition-all"
                    title="Inspect the current page DOM to verify if security challenge has been completed"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isVerifyingPage ? 'animate-spin' : ''}`} />
                    {isVerifyingPage ? 'Checking Page...' : 'Check Page Again'}
                  </button>

                  {/* Button 3: Safe Resume AI Testing */}
                  <button
                    onClick={handleResumeVerification}
                    disabled={!canResume || resumingLoading || currentTask?.executionMode === 'MANUAL_ONLY'}
                    className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold text-white transition-all shadow-lg ${
                      canResume && currentTask?.executionMode !== 'MANUAL_ONLY'
                        ? 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-600/30'
                        : 'bg-slate-800 border border-slate-700 text-slate-500 cursor-not-allowed opacity-60'
                    }`}
                    title={
                      currentTask?.executionMode === 'MANUAL_ONLY'
                        ? 'Task is designated as MANUAL_ONLY. Automated execution is restricted.'
                        : canResume
                        ? 'Resume autonomous testing on the existing browser session'
                        : 'Application readiness must be confirmed via Check Page Again before resuming'
                    }
                  >
                    <Play className="w-3.5 h-3.5 fill-white" />
                    {resumingLoading ? 'Resuming...' : 'Resume AI Testing'}
                  </button>

                  {/* Button 4: Cancel Run */}
                  <button
                    onClick={stopRun}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-rose-950/60 hover:bg-rose-900 border border-rose-800 text-xs font-semibold text-rose-300 transition-colors"
                  >
                    <Square className="w-3 h-3 fill-rose-300" /> Cancel Run
                  </button>
                </div>

                {/* Additional Guidance Note */}
                <div className="text-[10px] text-slate-500 leading-normal">
                  Note: Automated CAPTCHA solving, bot evasion scripts, and stealth plugins are strictly prohibited by platform policy. 
                  Manual verification completed in the browser does not alter authorization scopes or artificially inflate passed functional tests.
                </div>
              </div>
            ) : liveScreenshotBase64 ? (
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
            ) : agentStatus === 'BLOCKED' || agentStatus === 'BLOCKED_AUTHORIZATION' ? (
              <div className="text-center space-y-4 max-w-lg p-8 glass-panel border border-amber-500/40 bg-amber-950/20 rounded-2xl shadow-2xl">
                <ShieldAlert className="w-14 h-14 text-amber-400 mx-auto" />
                <div className="space-y-2">
                  <h3 className="text-lg font-bold text-amber-200">Autonomous Testing Blocked</h3>
                  <div className="inline-block px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-mono">
                    AUTHORIZATION_REQUIRED
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    Target destination <span className="font-mono text-amber-300 font-semibold">{targetUrl}</span> is not authorized for autonomous AI browser interaction.
                  </p>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    {targetAuthorization?.isTestIo ? (
                      <span className="text-rose-400 font-medium">
                        Test IO platform rules strictly prohibit automating tester.test.io (claiming, answers, submission). Please test the customer application directly.
                      </span>
                    ) : (
                      'Agent Studio enforces a strict default-deny policy. You can manually inspect the website in your browser, or create a verified authorization record.'
                    )}
                  </p>
                </div>

                <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-3">
                  <button
                    onClick={handleOpenTargetExternal}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 border border-slate-700 transition-colors"
                  >
                    <ExternalLink className="w-3.5 h-3.5 text-blue-400" /> Open Website (Manual View)
                  </button>
                  {!targetAuthorization?.isTestIo && (
                    <button
                      onClick={() => setIsAuthModalOpen(true)}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-xs font-semibold text-white shadow-lg shadow-amber-600/30 transition-colors"
                    >
                      <Lock className="w-3.5 h-3.5" /> Authorize Website for AI
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="text-center space-y-4 max-w-md p-8 glass-panel border border-slate-800 rounded-2xl">
                <Globe className="w-12 h-12 text-blue-400/80 mx-auto animate-pulse" />
                <div className="space-y-1">
                  <h3 className="text-base font-bold text-white">Playwright Headless Engine Ready</h3>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Click <b className="text-emerald-400">Start AI Test</b> above to launch an authorized Chromium session against <span className="font-mono text-blue-300">{targetUrl}</span>.
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
              {/* Active Step Reasoning Box - Only displayed while actively running */}
              {agentStatus === 'RUNNING' && (
                <div className="p-3 rounded-lg bg-blue-950/20 border border-blue-500/30 space-y-1.5">
                  <div className="font-semibold text-blue-400 flex items-center gap-1.5">
                    <span>🧠</span> Active Step Reasoning
                  </div>
                  <p className="text-slate-300 leading-relaxed font-mono text-[11px]">
                    {activeStepGoal ? `Executing: ${activeStepGoal}` : 'Observing DOM tree and evaluating interactive controls...'}
                  </p>
                </div>
              )}

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
                          <span className={`text-[10px] px-2 py-0.5 rounded font-mono ${
                            ev.category === 'DIAGNOSTIC' ? 'bg-orange-950/80 text-orange-300 border border-orange-500/40' :
                            ev.category === 'AUDIT' ? 'bg-purple-950/80 text-purple-300 border border-purple-500/40' :
                            'bg-blue-950/80 text-blue-300 border border-blue-500/40'
                          }`}>
                            {ev.category === 'DIAGNOSTIC' ? 'Diagnostic' :
                             ev.category === 'AUDIT' ? 'Audit' : 'Functional Evidence'}
                          </span>
                        </div>
                        <div className="text-slate-400 break-all text-[10px] space-y-0.5">
                          <div><b className="text-slate-300">File:</b> {ev.filePath}</div>
                          <div><b className="text-slate-300">SHA-256:</b> <span className="text-blue-300 font-mono">{ev.sha256Hash}</span></div>
                          <div className="text-slate-500 flex justify-between pt-0.5">
                            <span>Step: {ev.stepId || 'General'}</span>
                            <span>{new Date(ev.timestamp).toLocaleTimeString()}</span>
                          </div>
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

      {/* Verified Authorization Modal */}
      {isAuthModalOpen && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#0f172a] border border-slate-700 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-5 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-base">Grant Verified Testing Authorization</h3>
                  <p className="text-[11px] text-slate-400">Establish explicit permission boundary for autonomous AI execution</p>
                </div>
              </div>
              <button
                onClick={() => setIsAuthModalOpen(false)}
                className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateAuth} className="p-6 space-y-4 text-xs">
              {authError && (
                <div className="p-3 rounded-lg bg-rose-950/40 border border-rose-500/40 text-rose-300">
                  {authError}
                </div>
              )}

              <div className="space-y-1.5">
                <label className="block font-semibold text-slate-300">Target Domain / Origin</label>
                <input
                  type="text"
                  value={authDomain}
                  onChange={(e) => setAuthDomain(e.target.value)}
                  placeholder="e.g. www.nautal.com or test-domain.local"
                  required
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3.5 py-2 text-white font-mono text-xs focus:outline-none focus:border-blue-500"
                />
                <p className="text-[10px] text-slate-500">Domain scope strictly limits Playwright navigation, popups, and redirects.</p>
              </div>

              <div className="space-y-1.5">
                <label className="block font-semibold text-slate-300">Verified Granting Party</label>
                <input
                  type="text"
                  value={authGrantingParty}
                  onChange={(e) => setAuthGrantingParty(e.target.value)}
                  placeholder="e.g. Nautal QA Team / Test IO Customer"
                  required
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3.5 py-2 text-white text-xs focus:outline-none focus:border-blue-500"
                />
                <p className="text-[10px] text-slate-500">Must represent a real authorized entity or customer providing testing permission.</p>
              </div>

              <div className="space-y-1.5">
                <label className="block font-semibold text-slate-300">Authorized Scope & Purpose</label>
                <input
                  type="text"
                  value={authScope}
                  onChange={(e) => setAuthScope(e.target.value)}
                  placeholder="e.g. Navigation & Exploratory Testing"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3.5 py-2 text-white text-xs focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="block font-semibold text-slate-300">Validity Period</label>
                  <select
                    value={authExpiresInDays}
                    onChange={(e) => setAuthExpiresInDays(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-xs focus:outline-none focus:border-blue-500"
                  >
                    <option value="1">1 Day</option>
                    <option value="7">7 Days</option>
                    <option value="30">30 Days</option>
                    <option value="90">90 Days</option>
                    <option value="0">Indefinite (Local/Dev Only)</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="block font-semibold text-slate-300">Allowed Actions</label>
                  <div className="grid grid-cols-2 gap-1.5 pt-0.5">
                    {['click', 'fill', 'navigate', 'scroll'].map(action => (
                      <label key={action} className="flex items-center gap-1.5 text-[11px] text-slate-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={authAllowedActions.includes(action)}
                          onChange={() => toggleAction(action)}
                          className="rounded bg-slate-900 border-slate-700 text-blue-500"
                        />
                        <span className="capitalize">{action}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              <div className="p-3 rounded-lg bg-blue-950/20 border border-blue-500/20 text-[11px] text-slate-400 leading-relaxed">
                <span className="text-blue-400 font-semibold">Default-Deny Policy:</span> This authorization is stored locally with an audit log. Autonomous AI browser actions will be strictly confined to this domain.
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsAuthModalOpen(false)}
                  className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isAuthorizing}
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-lg shadow-emerald-600/20 disabled:opacity-50 flex items-center gap-1.5"
                >
                  <ShieldCheck className="w-3.5 h-3.5" /> {isAuthorizing ? 'Recording...' : 'Grant & Authorize'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
