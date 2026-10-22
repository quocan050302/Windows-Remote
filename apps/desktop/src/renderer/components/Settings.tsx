import React, { useState, useEffect } from 'react';
import { useStudioStore } from '../store';
import { apiClient } from '../api';
import {
  Settings as SettingsIcon,
  Shield,
  Cpu,
  Key,
  Sliders,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  Eye,
  EyeOff,
  RefreshCw,
  Trash2,
  Lock,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Zap,
  Server
} from 'lucide-react';
import type {
  AiProviderId,
  ProviderPublicStatus,
  ProviderConnectionStatus,
  PublicSettingsResponse,
  ActiveAiRuntime
} from '@test-io-agent/shared';

export const Settings: React.FC = () => {
  const { executionMode, setExecutionMode } = useStudioStore();

  const [loading, setLoading] = useState<boolean>(true);
  const [settingsData, setSettingsData] = useState<PublicSettingsResponse | null>(null);
  const [activeRuntime, setActiveRuntime] = useState<ActiveAiRuntime | null>(null);

  // Per-provider draft states
  const [draftKeys, setDraftKeys] = useState<Record<string, string>>({
    gemini: '',
    openai: '',
    anthropic: '',
    ollamaUrl: 'http://127.0.0.1:11434'
  });

  const [showKey, setShowKey] = useState<Record<string, boolean>>({
    gemini: false,
    openai: false,
    anthropic: false
  });

  const [testingProvider, setTestingProvider] = useState<string | null>(null);
  const [savingProvider, setSavingProvider] = useState<string | null>(null);
  const [diagnosticsOpen, setDiagnosticsOpen] = useState<Record<string, boolean>>({});
  const [expandedCard, setExpandedCard] = useState<string>('gemini');
  const [actionMessage, setActionMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const data = await apiClient.getPublicSettings();
      if (data) {
        setSettingsData(data);
        setActiveRuntime(data.activeRuntime);
        if (data.providers?.ollama?.endpointUrl) {
          setDraftKeys((prev) => ({ ...prev, ollamaUrl: data.providers.ollama.endpointUrl || prev.ollamaUrl }));
        }
      }
    } catch (err: any) {
      console.warn('Could not load public settings:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const handleTestConnection = async (providerId: AiProviderId) => {
    const draftKey = draftKeys[providerId];
    setTestingProvider(providerId);
    setActionMessage(null);

    try {
      const res = await apiClient.testProviderConnection(providerId, draftKey || undefined);
      if (res.status === 'CONNECTED') {
        setActionMessage({
          text: `Connection verified! Selected model: ${res.selectedModel} (${res.latencyMs || 0}ms)`,
          type: 'success'
        });
      } else {
        setActionMessage({
          text: `Connection test result: ${res.status}. ${res.details || ''}`,
          type: 'error'
        });
      }
      await fetchSettings();
    } catch (err: any) {
      setActionMessage({ text: `Test connection error: ${err.message}`, type: 'error' });
    } finally {
      setTestingProvider(null);
    }
  };

  const handleSaveKey = async (providerId: AiProviderId) => {
    const key = draftKeys[providerId];
    if (!key) {
      setActionMessage({ text: 'Please enter an API key before saving.', type: 'error' });
      return;
    }

    setSavingProvider(providerId);
    setActionMessage(null);

    try {
      await apiClient.saveProviderKey(providerId, key);
      setDraftKeys((prev) => ({ ...prev, [providerId]: '' }));
      setActionMessage({
        text: `API key for ${providerId.toUpperCase()} saved securely in Windows DPAPI encrypted vault.`,
        type: 'success'
      });
      await fetchSettings();
    } catch (err: any) {
      setActionMessage({ text: `Failed to save key: ${err.message}`, type: 'error' });
    } finally {
      setSavingProvider(null);
    }
  };

  const handleRemoveKey = async (providerId: AiProviderId) => {
    if (!window.confirm(`Are you sure you want to remove the stored API key for ${providerId.toUpperCase()}?`)) {
      return;
    }

    try {
      await apiClient.removeProviderKey(providerId);
      setActionMessage({ text: `API key for ${providerId.toUpperCase()} removed.`, type: 'info' });
      await fetchSettings();
    } catch (err: any) {
      setActionMessage({ text: `Failed to remove key: ${err.message}`, type: 'error' });
    }
  };

  const handleActivateProvider = async (providerId: AiProviderId) => {
    try {
      const runtime = await apiClient.activateProvider(providerId);
      setActiveRuntime(runtime);
      setActionMessage({
        text: `Active reasoning provider switched to ${runtime.providerName} (Model: ${runtime.modelId})`,
        type: 'success'
      });
      await fetchSettings();
    } catch (err: any) {
      setActionMessage({ text: `Cannot activate provider: ${err.message}`, type: 'error' });
    }
  };

  const getStatusBadge = (status: ProviderConnectionStatus) => {
    switch (status) {
      case 'CONNECTED':
        return (
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 className="w-3.5 h-3.5" /> Connected
          </span>
        );
      case 'SAVED_UNVERIFIED':
        return (
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <Clock className="w-3.5 h-3.5" /> Saved (Unverified)
          </span>
        );
      case 'VERIFYING':
        return (
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">
            <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Verifying...
          </span>
        );
      case 'INVALID_CREDENTIAL':
        return (
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-500/10 text-red-400 border border-red-500/20">
            <XCircle className="w-3.5 h-3.5" /> Invalid Key
          </span>
        );
      case 'MODEL_UNAVAILABLE':
        return (
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-orange-500/10 text-orange-400 border border-orange-500/20">
            <AlertTriangle className="w-3.5 h-3.5" /> Model Unavailable
          </span>
        );
      case 'INFERENCE_FAILED':
        return (
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-500/10 text-red-400 border border-red-500/20">
            <XCircle className="w-3.5 h-3.5" /> Inference Failed
          </span>
        );
      case 'RATE_LIMITED':
      case 'QUOTA_EXCEEDED':
        return (
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
            <AlertTriangle className="w-3.5 h-3.5" /> Quota / Rate Limited
          </span>
        );
      default:
        return (
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-800 text-slate-400 border border-slate-700">
            Not Configured
          </span>
        );
    }
  };

  const providers = settingsData?.providers;

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-8 overflow-y-auto h-full text-slate-100">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-6">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <SettingsIcon className="w-7 h-7 text-blue-400" /> Studio Settings & AI Providers
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Configure secure API credentials, automatic model discovery, Windows-MCP native controls, and safety guardrails.
          </p>
        </div>
        <button
          onClick={fetchSettings}
          disabled={loading}
          className="self-start md:self-auto flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 border border-slate-700 transition-all"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh Status
        </button>
      </div>

      {/* Global Feedback Banner */}
      {actionMessage && (
        <div
          className={`p-4 rounded-xl border flex items-center justify-between transition-all ${
            actionMessage.type === 'success'
              ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-300'
              : actionMessage.type === 'error'
              ? 'bg-red-950/40 border-red-500/30 text-red-300'
              : 'bg-blue-950/40 border-blue-500/30 text-blue-300'
          }`}
        >
          <div className="flex items-center gap-2 text-sm">
            {actionMessage.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            ) : actionMessage.type === 'error' ? (
              <XCircle className="w-5 h-5 text-red-400" />
            ) : (
              <Clock className="w-5 h-5 text-blue-400" />
            )}
            <span>{actionMessage.text}</span>
          </div>
          <button
            onClick={() => setActionMessage(null)}
            className="text-xs text-slate-400 hover:text-white px-2 py-1"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Active AI Provider Summary Banner */}
      <div className="glass-panel p-6 rounded-2xl border border-blue-500/30 bg-gradient-to-r from-blue-950/30 via-slate-900/60 to-purple-950/30 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-blue-500/20 text-blue-400 border border-blue-500/30">
              <Zap className="w-6 h-6" />
            </div>
            <div>
              <div className="text-xs font-semibold tracking-wider text-blue-400 uppercase">
                Active Reasoning Engine
              </div>
              <div className="text-xl font-bold text-white flex items-center gap-2">
                {activeRuntime?.providerName || 'Loading...'}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 self-start sm:self-auto">
            {activeRuntime && getStatusBadge(activeRuntime.status)}
            <span className="text-xs font-mono bg-slate-900/80 px-2.5 py-1 rounded border border-slate-700 text-slate-300">
              {activeRuntime?.credentialSource || 'BUILTIN'}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-800/80 text-xs text-slate-300">
          <div>
            <span className="text-slate-500 block mb-0.5">Automatically Selected Model</span>
            <span className="font-mono text-emerald-400 font-semibold text-sm">
              {activeRuntime?.modelId || 'None'}
            </span>
          </div>
          <div>
            <span className="text-slate-500 block mb-0.5">Inference Status</span>
            <span className="font-semibold text-white">
              {activeRuntime?.inferenceReady ? 'Verified & Ready for Autonomous Runs' : 'Not Verified'}
            </span>
          </div>
          <div>
            <span className="text-slate-500 block mb-0.5">Last Verified</span>
            <span className="text-slate-400">
              {activeRuntime?.lastVerifiedAt
                ? new Date(activeRuntime.lastVerifiedAt).toLocaleTimeString()
                : 'Never'}
            </span>
          </div>
        </div>
      </div>

      {/* AI Provider Management Cards */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <Key className="w-5 h-5 text-purple-400" /> AI Provider Credentials & Model Selection
          </h2>
          <span className="text-xs text-slate-400">
            Encrypted with Windows DPAPI (safeStorage)
          </span>
        </div>

        {/* 1. Google Gemini Card */}
        {(() => {
          const p = providers?.gemini;
          const isExpanded = expandedCard === 'gemini';
          const isActive = activeRuntime?.providerId === 'gemini';
          const isVerifying = testingProvider === 'gemini';
          const isSaving = savingProvider === 'gemini';

          return (
            <div className={`glass-panel rounded-xl border transition-all ${
              isActive ? 'border-blue-500/60 bg-blue-950/10' : 'border-slate-800 bg-slate-900/30'
            }`}>
              <div
                onClick={() => setExpandedCard(isExpanded ? '' : 'gemini')}
                className="p-5 flex items-center justify-between cursor-pointer select-none"
              >
                <div className="flex items-center gap-3.5">
                  <div className="w-10 h-10 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center font-bold text-blue-400">
                    G
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-white text-base">Google Gemini</span>
                      {isActive && (
                        <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/40">
                          Active
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      {p?.selectedModel ? `Selected model: ${p.selectedModel}` : 'Auto-selects gemini-3.5-flash / 3.8'}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {p && getStatusBadge(p.connectionStatus)}
                  {isExpanded ? <ChevronUp className="w-5 h-5 text-slate-400" /> : <ChevronDown className="w-5 h-5 text-slate-400" />}
                </div>
              </div>

              {isExpanded && (
                <div className="px-5 pb-5 pt-2 border-t border-slate-800/60 space-y-4">
                  {/* Key Storage Status */}
                  <div className="flex items-center justify-between text-xs bg-slate-950/60 p-3 rounded-lg border border-slate-800">
                    <div className="flex items-center gap-2 text-slate-300">
                      <Lock className="w-4 h-4 text-emerald-400" />
                      {p?.hasStoredCredential ? (
                        <span>API key saved securely in Windows DPAPI encrypted vault.</span>
                      ) : p?.isConfiguredViaEnv ? (
                        <span className="text-amber-300">Configured via local environment variable (.env)</span>
                      ) : (
                        <span className="text-slate-400">No credential stored yet.</span>
                      )}
                    </div>
                    {p?.hasStoredCredential && (
                      <button
                        onClick={() => handleRemoveKey('gemini')}
                        className="text-red-400 hover:text-red-300 flex items-center gap-1 font-semibold"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> Remove Key
                      </button>
                    )}
                  </div>

                  {/* Input Field */}
                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-slate-300">
                      {p?.hasStoredCredential ? 'Replace API Key' : 'Enter Gemini API Key'}
                    </label>
                    <div className="relative">
                      <input
                        type={showKey.gemini ? 'text' : 'password'}
                        value={draftKeys.gemini}
                        onChange={(e) => setDraftKeys((prev) => ({ ...prev, gemini: e.target.value }))}
                        placeholder={p?.hasStoredCredential ? '•••••••••••••••••••••••• (Leave blank to keep current)' : 'AQ... or AIzaSy...'}
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500 font-mono pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowKey((prev) => ({ ...prev, gemini: !prev.gemini }))}
                        className="absolute right-3 top-2.5 text-slate-400 hover:text-white"
                      >
                        {showKey.gemini ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    {draftKeys.gemini && (
                      <div className="text-[11px] text-amber-400 flex items-center gap-1">
                        <AlertTriangle className="w-3.5 h-3.5" /> Unsaved draft key. Click 'Test Connection' or 'Save Key'.
                      </div>
                    )}
                  </div>

                  {/* Actions Bar */}
                  <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleTestConnection('gemini')}
                        disabled={isVerifying || isSaving}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs font-semibold text-white transition-all disabled:opacity-50"
                      >
                        {isVerifying ? (
                          <>
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Verifying API...
                          </>
                        ) : (
                          <>
                            <Zap className="w-3.5 h-3.5" /> Test Connection
                          </>
                        )}
                      </button>

                      {draftKeys.gemini && (
                        <button
                          onClick={() => handleSaveKey('gemini')}
                          disabled={isSaving || isVerifying}
                          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white transition-all disabled:opacity-50"
                        >
                          <Lock className="w-3.5 h-3.5" /> Save Key Securely
                        </button>
                      )}
                    </div>

                    {!isActive && (p?.hasStoredCredential || p?.isConfiguredViaEnv) && (
                      <button
                        onClick={() => handleActivateProvider('gemini')}
                        className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-blue-300 border border-blue-500/30 transition-all"
                      >
                        Use This Provider
                      </button>
                    )}
                  </div>

                  {/* Diagnostics Drawer */}
                  {p?.lastTestedAt && (
                    <div className="pt-2 text-xs border-t border-slate-800/80 text-slate-400">
                      <div className="flex justify-between items-center py-1">
                        <span>Auto-selected Model:</span>
                        <span className="font-mono text-emerald-400 font-semibold">{p.selectedModel || 'None'}</span>
                      </div>
                      <div className="flex justify-between items-center py-1">
                        <span>Response Latency:</span>
                        <span className="font-mono text-slate-200">{p.lastLatencyMs || 0} ms</span>
                      </div>
                      {p.errorReason && (
                        <div className="mt-1 p-2 rounded bg-red-950/30 border border-red-500/20 text-red-300 text-[11px]">
                          {p.errorReason}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })()}

        {/* 2. OpenAI Card */}
        {(() => {
          const p = providers?.openai;
          const isExpanded = expandedCard === 'openai';
          const isActive = activeRuntime?.providerId === 'openai';
          const isVerifying = testingProvider === 'openai';
          const isSaving = savingProvider === 'openai';

          return (
            <div className={`glass-panel rounded-xl border transition-all ${
              isActive ? 'border-blue-500/60 bg-blue-950/10' : 'border-slate-800 bg-slate-900/30'
            }`}>
              <div
                onClick={() => setExpandedCard(isExpanded ? '' : 'openai')}
                className="p-5 flex items-center justify-between cursor-pointer select-none"
              >
                <div className="flex items-center gap-3.5">
                  <div className="w-10 h-10 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center font-bold text-emerald-400">
                    O
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-white text-base">OpenAI GPT</span>
                      {isActive && (
                        <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/40">
                          Active
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      {p?.selectedModel ? `Selected model: ${p.selectedModel}` : 'Auto-selects gpt-4o / gpt-4o-mini'}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {p && getStatusBadge(p.connectionStatus)}
                  {isExpanded ? <ChevronUp className="w-5 h-5 text-slate-400" /> : <ChevronDown className="w-5 h-5 text-slate-400" />}
                </div>
              </div>

              {isExpanded && (
                <div className="px-5 pb-5 pt-2 border-t border-slate-800/60 space-y-4">
                  <div className="flex items-center justify-between text-xs bg-slate-950/60 p-3 rounded-lg border border-slate-800">
                    <div className="flex items-center gap-2 text-slate-300">
                      <Lock className="w-4 h-4 text-emerald-400" />
                      {p?.hasStoredCredential ? (
                        <span>API key saved securely in Windows DPAPI encrypted vault.</span>
                      ) : p?.isConfiguredViaEnv ? (
                        <span className="text-amber-300">Configured via OPENAI_API_KEY (.env)</span>
                      ) : (
                        <span className="text-slate-400">No credential stored yet.</span>
                      )}
                    </div>
                    {p?.hasStoredCredential && (
                      <button
                        onClick={() => handleRemoveKey('openai')}
                        className="text-red-400 hover:text-red-300 flex items-center gap-1 font-semibold"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> Remove Key
                      </button>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-slate-300">
                      {p?.hasStoredCredential ? 'Replace API Key' : 'Enter OpenAI API Key'}
                    </label>
                    <div className="relative">
                      <input
                        type={showKey.openai ? 'text' : 'password'}
                        value={draftKeys.openai}
                        onChange={(e) => setDraftKeys((prev) => ({ ...prev, openai: e.target.value }))}
                        placeholder={p?.hasStoredCredential ? '••••••••••••••••••••••••' : 'sk-...'}
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500 font-mono pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowKey((prev) => ({ ...prev, openai: !prev.openai }))}
                        className="absolute right-3 top-2.5 text-slate-400 hover:text-white"
                      >
                        {showKey.openai ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleTestConnection('openai')}
                        disabled={isVerifying || isSaving}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white transition-all disabled:opacity-50"
                      >
                        {isVerifying ? (
                          <>
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Verifying...
                          </>
                        ) : (
                          <>
                            <Zap className="w-3.5 h-3.5" /> Test Connection
                          </>
                        )}
                      </button>

                      {draftKeys.openai && (
                        <button
                          onClick={() => handleSaveKey('openai')}
                          disabled={isSaving || isVerifying}
                          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs font-semibold text-white transition-all disabled:opacity-50"
                        >
                          <Lock className="w-3.5 h-3.5" /> Save Key Securely
                        </button>
                      )}
                    </div>

                    {!isActive && (p?.hasStoredCredential || p?.isConfiguredViaEnv) && (
                      <button
                        onClick={() => handleActivateProvider('openai')}
                        className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-blue-300 border border-blue-500/30 transition-all"
                      >
                        Use This Provider
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {/* 3. Anthropic Claude Card */}
        {(() => {
          const p = providers?.anthropic;
          const isExpanded = expandedCard === 'anthropic';
          const isActive = activeRuntime?.providerId === 'anthropic';
          const isVerifying = testingProvider === 'anthropic';
          const isSaving = savingProvider === 'anthropic';

          return (
            <div className={`glass-panel rounded-xl border transition-all ${
              isActive ? 'border-blue-500/60 bg-blue-950/10' : 'border-slate-800 bg-slate-900/30'
            }`}>
              <div
                onClick={() => setExpandedCard(isExpanded ? '' : 'anthropic')}
                className="p-5 flex items-center justify-between cursor-pointer select-none"
              >
                <div className="flex items-center gap-3.5">
                  <div className="w-10 h-10 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center font-bold text-amber-400">
                    A
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-white text-base">Anthropic Claude</span>
                      {isActive && (
                        <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/40">
                          Active
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      {p?.selectedModel ? `Selected model: ${p.selectedModel}` : 'Auto-selects claude-3-7-sonnet'}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {p && getStatusBadge(p.connectionStatus)}
                  {isExpanded ? <ChevronUp className="w-5 h-5 text-slate-400" /> : <ChevronDown className="w-5 h-5 text-slate-400" />}
                </div>
              </div>

              {isExpanded && (
                <div className="px-5 pb-5 pt-2 border-t border-slate-800/60 space-y-4">
                  <div className="flex items-center justify-between text-xs bg-slate-950/60 p-3 rounded-lg border border-slate-800">
                    <div className="flex items-center gap-2 text-slate-300">
                      <Lock className="w-4 h-4 text-emerald-400" />
                      {p?.hasStoredCredential ? (
                        <span>API key saved securely in Windows DPAPI encrypted vault.</span>
                      ) : p?.isConfiguredViaEnv ? (
                        <span className="text-amber-300">Configured via ANTHROPIC_API_KEY (.env)</span>
                      ) : (
                        <span className="text-slate-400">No credential stored yet.</span>
                      )}
                    </div>
                    {p?.hasStoredCredential && (
                      <button
                        onClick={() => handleRemoveKey('anthropic')}
                        className="text-red-400 hover:text-red-300 flex items-center gap-1 font-semibold"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> Remove Key
                      </button>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-slate-300">
                      {p?.hasStoredCredential ? 'Replace API Key' : 'Enter Anthropic API Key'}
                    </label>
                    <div className="relative">
                      <input
                        type={showKey.anthropic ? 'text' : 'password'}
                        value={draftKeys.anthropic}
                        onChange={(e) => setDraftKeys((prev) => ({ ...prev, anthropic: e.target.value }))}
                        placeholder={p?.hasStoredCredential ? '••••••••••••••••••••••••' : 'sk-ant-...'}
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500 font-mono pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowKey((prev) => ({ ...prev, anthropic: !prev.anthropic }))}
                        className="absolute right-3 top-2.5 text-slate-400 hover:text-white"
                      >
                        {showKey.anthropic ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleTestConnection('anthropic')}
                        disabled={isVerifying || isSaving}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-xs font-semibold text-white transition-all disabled:opacity-50"
                      >
                        {isVerifying ? (
                          <>
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Verifying...
                          </>
                        ) : (
                          <>
                            <Zap className="w-3.5 h-3.5" /> Test Connection
                          </>
                        )}
                      </button>

                      {draftKeys.anthropic && (
                        <button
                          onClick={() => handleSaveKey('anthropic')}
                          disabled={isSaving || isVerifying}
                          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs font-semibold text-white transition-all disabled:opacity-50"
                        >
                          <Lock className="w-3.5 h-3.5" /> Save Key Securely
                        </button>
                      )}
                    </div>

                    {!isActive && (p?.hasStoredCredential || p?.isConfiguredViaEnv) && (
                      <button
                        onClick={() => handleActivateProvider('anthropic')}
                        className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-blue-300 border border-blue-500/30 transition-all"
                      >
                        Use This Provider
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {/* 4. Ollama Local Models Card */}
        {(() => {
          const p = providers?.ollama;
          const isExpanded = expandedCard === 'ollama';
          const isActive = activeRuntime?.providerId === 'ollama';
          const isVerifying = testingProvider === 'ollama';

          return (
            <div className={`glass-panel rounded-xl border transition-all ${
              isActive ? 'border-blue-500/60 bg-blue-950/10' : 'border-slate-800 bg-slate-900/30'
            }`}>
              <div
                onClick={() => setExpandedCard(isExpanded ? '' : 'ollama')}
                className="p-5 flex items-center justify-between cursor-pointer select-none"
              >
                <div className="flex items-center gap-3.5">
                  <div className="w-10 h-10 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center font-bold text-purple-400">
                    <Server className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-white text-base">Ollama Local Models</span>
                      {isActive && (
                        <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/40">
                          Active
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      {p?.selectedModel ? `Selected model: ${p.selectedModel}` : 'Offline local inference'}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {p && getStatusBadge(p.connectionStatus)}
                  {isExpanded ? <ChevronUp className="w-5 h-5 text-slate-400" /> : <ChevronDown className="w-5 h-5 text-slate-400" />}
                </div>
              </div>

              {isExpanded && (
                <div className="px-5 pb-5 pt-2 border-t border-slate-800/60 space-y-4">
                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-slate-300">
                      Ollama Server URL
                    </label>
                    <input
                      type="text"
                      value={draftKeys.ollamaUrl}
                      onChange={(e) => setDraftKeys((prev) => ({ ...prev, ollamaUrl: e.target.value }))}
                      placeholder="http://127.0.0.1:11434"
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500 font-mono"
                    />
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                    <button
                      onClick={() => handleTestConnection('ollama')}
                      disabled={isVerifying}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-xs font-semibold text-white transition-all disabled:opacity-50"
                    >
                      {isVerifying ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Checking Local Instance...
                        </>
                      ) : (
                        <>
                          <Zap className="w-3.5 h-3.5" /> Test Local Connection
                        </>
                      )}
                    </button>

                    {!isActive && p?.connectionStatus === 'CONNECTED' && (
                      <button
                        onClick={() => handleActivateProvider('ollama')}
                        className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-blue-300 border border-blue-500/30 transition-all"
                      >
                        Use This Provider
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {/* 5. Built-in Deterministic Engine */}
        <div className={`glass-panel rounded-xl border p-5 flex items-center justify-between transition-all ${
          activeRuntime?.providerId === 'deterministic' ? 'border-blue-500/60 bg-blue-950/10' : 'border-slate-800 bg-slate-900/30'
        }`}>
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center font-bold text-cyan-400">
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-white text-base">Deterministic QA Engine</span>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  Built-in
                </span>
                {activeRuntime?.providerId === 'deterministic' && (
                  <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/40">
                    Active
                  </span>
                )}
              </div>
              <div className="text-xs text-slate-400 mt-0.5">
                Deterministic mathematical reasoning (Zero external API dependencies, zero cost)
              </div>
            </div>
          </div>

          <div>
            {activeRuntime?.providerId !== 'deterministic' && (
              <button
                onClick={() => handleActivateProvider('deterministic')}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 border border-slate-700 transition-all"
              >
                Use Deterministic
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Execution Mode Guardrails */}
      <div className="glass-panel p-6 space-y-4 rounded-xl border border-slate-800">
        <div className="flex items-center gap-2.5 text-base font-semibold text-white">
          <Shield className="w-5 h-5 text-amber-400" /> Default Execution Mode Guardrail
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {[
            { id: 'COPILOT_MODE', title: 'Copilot Mode', desc: 'AI analyzes and plans; human performs clicks.' },
            { id: 'SUPERVISED_MODE', title: 'Supervised Mode', desc: 'AI proposes steps; human approves each action.' },
            { id: 'AUTHORIZED_AUTO_MODE', title: 'Authorized Auto', desc: 'Full autonomy strictly against authorized domains.' }
          ].map((m) => (
            <div
              key={m.id}
              onClick={() => setExecutionMode(m.id as any)}
              className={`p-4 rounded-xl border cursor-pointer transition-all ${
                executionMode === m.id
                  ? 'bg-blue-600/10 border-blue-500 text-white shadow-lg shadow-blue-500/5'
                  : 'bg-slate-900/40 border-slate-800 text-slate-400 hover:border-slate-700'
              }`}
            >
              <div className="font-semibold text-sm text-white mb-1">{m.title}</div>
              <div className="text-xs text-slate-400 leading-relaxed">{m.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Windows-MCP Native Adapter Settings */}
      <div className="glass-panel p-6 space-y-4 rounded-xl border border-slate-800">
        <div className="flex items-center gap-2.5 text-base font-semibold text-white">
          <Sliders className="w-5 h-5 text-cyan-400" /> Windows-MCP Native Adapter Safety Controls
        </div>
        <div className="space-y-3 text-sm text-slate-300">
          <div className="flex justify-between items-center py-2 border-b border-slate-800">
            <div>
              <div className="font-medium text-white">Idle Takeover Timeout</div>
              <div className="text-xs text-slate-500">Seconds before AI yields control to physical mouse movements</div>
            </div>
            <span className="font-mono bg-slate-900 px-3 py-1 rounded border border-slate-700 text-slate-300">10.0s</span>
          </div>

          <div className="flex justify-between items-center py-2 border-b border-slate-800">
            <div>
              <div className="font-medium text-white">Prohibited Tools Filter</div>
              <div className="text-xs text-slate-500">PowerShell, Shell, Registry, FileSystem are permanently blocked</div>
            </div>
            <span className="text-xs font-semibold text-emerald-400 px-2 py-1 rounded bg-emerald-500/10 border border-emerald-500/20">
              ENFORCED
            </span>
          </div>

          <div className="flex justify-between items-center py-2">
            <div>
              <div className="font-medium text-white">Telemetry PostHog</div>
              <div className="text-xs text-slate-500">Outbound tracking permanently disabled (ANONYMIZED_TELEMETRY=false)</div>
            </div>
            <span className="text-xs font-semibold text-emerald-400 px-2 py-1 rounded bg-emerald-500/10 border border-emerald-500/20">
              DISABLED
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
