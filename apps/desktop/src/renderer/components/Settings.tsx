import React from 'react';
import { useStudioStore } from '../store';
import { Settings as SettingsIcon, Shield, Cpu, Key, Sliders } from 'lucide-react';

export const Settings: React.FC = () => {
  const { executionMode, setExecutionMode } = useStudioStore();

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-8 overflow-y-auto h-full">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2.5">
          <SettingsIcon className="w-6 h-6 text-blue-400" /> Studio Settings & Policies
        </h1>
        <p className="text-slate-400 text-sm mt-1">Configure AI model providers, safety guardrails, and execution modes</p>
      </div>

      <div className="space-y-6">
        {/* Execution Mode */}
        <div className="glass-panel p-6 space-y-4">
          <div className="flex items-center gap-2.5 text-base font-semibold text-white">
            <Shield className="w-5 h-5 text-amber-400" /> Default Execution Mode
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
                    ? 'bg-blue-600/10 border-blue-500 text-white' 
                    : 'bg-slate-900/40 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <div className="font-semibold text-sm text-white mb-1">{m.title}</div>
                <div className="text-xs text-slate-400 leading-relaxed">{m.desc}</div>
              </div>
            ))}
          </div>
        </div>

        {/* AI Provider Configuration */}
        <div className="glass-panel p-6 space-y-4">
          <div className="flex items-center gap-2.5 text-base font-semibold text-white">
            <Cpu className="w-5 h-5 text-purple-400" /> Reasoning Model Provider
          </div>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">Selected Provider</label>
              <select className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500">
                <option value="deterministic">Deterministic QA Reasoner (Built-in / Zero Flakiness)</option>
                <option value="gemini">Google Gemini (Gemini 2.5 Flash / 3.8)</option>
                <option value="anthropic">Anthropic Claude (Claude 3.7 Sonnet)</option>
                <option value="ollama">Ollama Local Inference (Offline)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Windows-MCP Configuration */}
        <div className="glass-panel p-6 space-y-4">
          <div className="flex items-center gap-2.5 text-base font-semibold text-white">
            <Sliders className="w-5 h-5 text-cyan-400" /> Windows-MCP Native Adapter Settings
          </div>
          <div className="space-y-3 text-sm text-slate-300">
            <div className="flex justify-between items-center py-2 border-b border-slate-800">
              <div>
                <div className="font-medium text-white">Idle Takeover Timeout</div>
                <div className="text-xs text-slate-500">Seconds before AI yields control to physical mouse movements</div>
              </div>
              <span className="font-mono bg-slate-900 px-3 py-1 rounded border border-slate-700">10.0s</span>
            </div>

            <div className="flex justify-between items-center py-2 border-b border-slate-800">
              <div>
                <div className="font-medium text-white">Prohibited Tools Filter</div>
                <div className="text-xs text-slate-500">PowerShell, Shell, Registry, FileSystem are permanently blocked</div>
              </div>
              <span className="text-xs font-semibold text-emerald-400 px-2 py-1 rounded bg-emerald-500/10 border border-emerald-500/20">ENFORCED</span>
            </div>

            <div className="flex justify-between items-center py-2">
              <div>
                <div className="font-medium text-white">Telemetry PostHog</div>
                <div className="text-xs text-slate-500">Outbound tracking permanently disabled (ANONYMIZED_TELEMETRY=false)</div>
              </div>
              <span className="text-xs font-semibold text-emerald-400 px-2 py-1 rounded bg-emerald-500/10 border border-emerald-500/20">DISABLED</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
