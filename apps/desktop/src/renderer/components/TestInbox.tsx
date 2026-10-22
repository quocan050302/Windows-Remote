import React from 'react';
import { useStudioStore } from '../store';
import { Inbox, CheckCircle, Clock, AlertTriangle, ArrowRight } from 'lucide-react';

export const TestInbox: React.FC = () => {
  const { setTab } = useStudioStore();

  const tasks = [
    {
      id: 'task_demo_1',
      title: 'Shopping Cart & Total Calculation Verification',
      source: 'Test IO Staging Request #849',
      priority: 'HIGH',
      status: 'READY',
      type: 'EXPLORATORY',
      domain: 'http://127.0.0.1:4173'
    },
    {
      id: 'task_demo_2',
      title: 'Customer Authentication & Form Validation Check',
      source: 'Test IO Staging Request #850',
      priority: 'MEDIUM',
      status: 'NEEDS_REVIEW',
      type: 'REGRESSION',
      domain: 'http://127.0.0.1:4173'
    }
  ];

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-6 overflow-y-auto h-full">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2.5">
            <Inbox className="w-6 h-6 text-blue-400" /> Test Tasks Inbox
          </h1>
          <p className="text-slate-400 text-sm mt-1">Authorized testing cycles and customer briefs</p>
        </div>
      </div>

      <div className="space-y-3">
        {tasks.map((t) => (
          <div key={t.id} className="glass-panel p-5 flex items-center justify-between hover:border-blue-500/40 transition-all">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2.5">
                <span className="text-xs px-2 py-0.5 rounded bg-blue-500/20 text-blue-400 font-semibold">{t.type}</span>
                <span className={`text-xs px-2 py-0.5 rounded font-semibold ${
                  t.status === 'READY' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'
                }`}>{t.status}</span>
                <span className="text-xs text-slate-500 font-mono">{t.id}</span>
              </div>
              <h3 className="text-base font-semibold text-white">{t.title}</h3>
              <p className="text-xs text-slate-400">{t.source} — Target: <span className="font-mono text-blue-300">{t.domain}</span></p>
            </div>

            <button 
              onClick={() => setTab('workspace')}
              className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold px-4 py-2.5 rounded-lg transition-colors"
            >
              Open in Workspace <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};
