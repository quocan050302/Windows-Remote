import React, { useState, useEffect } from 'react';
import { useStudioStore } from '../store';
import { apiClient } from '../api';
import { 
  Inbox, 
  ArrowRight, 
  Plus, 
  ExternalLink, 
  Shield, 
  CheckCircle, 
  AlertTriangle,
  X,
  FileText
} from 'lucide-react';
import type { TestingModuleType } from '@test-io-agent/shared';

const TEST_IO_REFERENCE_URL = 'https://tester.test.io/tests/q5abce2?source=dashboard';

export const TestInbox: React.FC = () => {
  const { tasks, fetchTasks, importTask, setTab, setTargetUrl } = useStudioStore();
  const [showImportModal, setShowImportModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  // Form fields
  const [title, setTitle] = useState('');
  const [testType, setTestType] = useState<TestingModuleType>('EXPLORATORY');
  const [cycleUrl, setCycleUrl] = useState(TEST_IO_REFERENCE_URL);
  const [targetUrl, setFormTargetUrl] = useState('http://127.0.0.1:4173');
  const [description, setDescription] = useState('');
  const [inScope, setInScope] = useState('Shopping Cart verification, Product detail inspection, Calculation accuracy');
  const [outOfScope, setOutOfScope] = useState('No payment submission, No external payment gateways, No third-party accounts');
  const [deviceReq, setDeviceReq] = useState('Windows 11 / Desktop Chrome');
  const [permissionConfirmed, setPermissionConfirmed] = useState(false);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  const handleOpenTestIO = async () => {
    try {
      await apiClient.openExternal(TEST_IO_REFERENCE_URL);
    } catch (err: any) {
      alert(`Could not open Test IO: ${err.message}`);
    }
  };

  const handleOpenInWorkspace = (task: any) => {
    if (task.targetUrl) {
      setTargetUrl(task.targetUrl);
    }
    useStudioStore.setState({ activeTaskId: task.id });
    setTab('workspace');
  };

  const handleImportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setImportError(null);

    if (!title.trim() || !description.trim()) {
      setImportError('Task title and description are required.');
      return;
    }

    if (!permissionConfirmed) {
      setImportError('You must confirm that you have explicit permission to test the target environment.');
      return;
    }

    setIsSubmitting(true);
    try {
      const fullDescription = `${description}\n\n[In-Scope]: ${inScope}\n[Out-of-Scope]: ${outOfScope}\n[Cycle Reference]: ${cycleUrl}\n[Device]: ${deviceReq}`;
      await importTask({
        title,
        description: fullDescription,
        targetUrl,
        targetApp: 'Authorized Target App',
        cycleId: cycleUrl,
        sourcePlatform: 'TEST_IO_IMPORT'
      });

      setShowImportModal(false);
      setTitle('');
      setDescription('');
      setPermissionConfirmed(false);
    } catch (err: any) {
      setImportError(err.message || 'Failed to import task.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-6 overflow-y-auto h-full">
      {/* Top Header & Test IO Assistant Link */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2.5">
            <Inbox className="w-6 h-6 text-blue-400" /> Test Tasks Inbox
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Authoritative SQLite database task inventory & Test IO requirements assistant
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleOpenTestIO}
            className="flex items-center gap-2 bg-gradient-to-r from-blue-700 to-indigo-700 hover:from-blue-600 hover:to-indigo-600 text-white text-xs font-semibold px-4 py-2.5 rounded-lg shadow-lg shadow-blue-500/20 transition-all border border-blue-400/30"
            title="Open verified Test IO cycle in default browser (Safe User-Only Link)"
          >
            <ExternalLink className="w-4 h-4" /> Open Test IO Cycle
          </button>

          <button
            onClick={() => setShowImportModal(true)}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold px-4 py-2.5 rounded-lg transition-colors shadow-lg shadow-emerald-600/20"
          >
            <Plus className="w-4 h-4" /> Import Task Requirements
          </button>
        </div>
      </div>

      {/* Safety Notice Banner */}
      <div className="glass-panel p-4 flex items-center gap-3.5 border-l-4 border-l-blue-500">
        <Shield className="w-5 h-5 text-blue-400 flex-shrink-0" />
        <div className="text-xs text-slate-300 leading-relaxed">
          <b className="text-white">Test IO Compliance Mode Active:</b> Direct automation against <code className="text-rose-300 font-mono">tester.test.io</code> is prohibited by policy. Use the <b className="text-blue-300">Open Test IO</b> button to review briefs in your standard browser, then copy permitted requirements here for AI-assisted test planning and autonomous execution on authorized targets.
        </div>
      </div>

      {/* Task List */}
      <div className="space-y-3">
        {tasks.length === 0 ? (
          <div className="glass-panel p-12 text-center space-y-3">
            <FileText className="w-8 h-8 text-slate-500 mx-auto" />
            <h3 className="text-base font-semibold text-slate-300">No tasks in database</h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              Import a test task from Test IO or wait for initial demo tasks to seed into SQLite.
            </p>
          </div>
        ) : (
          tasks.map((t) => {
            const isDemo = t.title.includes('[DEMO]');
            return (
              <div 
                key={t.id} 
                className="glass-panel p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:border-blue-500/40 transition-all"
              >
                <div className="space-y-1.5 flex-1">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    {isDemo && (
                      <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30">
                        DEMO LAB
                      </span>
                    )}
                    <span className="text-xs px-2 py-0.5 rounded bg-blue-500/20 text-blue-400 font-semibold">
                      {t.sourcePlatform}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded font-semibold ${
                      t.status === 'READY' || t.status === 'COMPLETED' 
                        ? 'bg-emerald-500/20 text-emerald-400' 
                        : 'bg-amber-500/20 text-amber-400'
                    }`}>
                      {t.status}
                    </span>
                    <span className="text-xs text-slate-500 font-mono">{t.id}</span>
                  </div>

                  <h3 className="text-base font-semibold text-white">{t.title}</h3>
                  <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed">{t.description}</p>
                  
                  {t.targetUrl && (
                    <div className="text-[11px] text-slate-400 flex items-center gap-1.5 pt-1">
                      <span>Target:</span>
                      <span className="font-mono text-blue-300 bg-blue-950/40 px-2 py-0.5 rounded border border-blue-900/50">
                        {t.targetUrl}
                      </span>
                    </div>
                  )}
                </div>

                <div className="flex-shrink-0">
                  <button 
                    onClick={() => handleOpenInWorkspace(t)}
                    className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold px-4 py-2.5 rounded-lg transition-colors border border-slate-700"
                  >
                    Open in Workspace <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Import Task Modal */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0f172a] border border-slate-700 rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl p-6 space-y-5">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Plus className="w-5 h-5 text-emerald-400" /> Import Test Task Requirements
              </h2>
              <button 
                onClick={() => setShowImportModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {importError && (
              <div className="p-3 bg-rose-950/40 border border-rose-500/40 rounded-lg text-rose-300 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" /> {importError}
              </div>
            )}

            <form onSubmit={handleImportSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Task Title *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Shopping Cart & Total Calculation Verification"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Testing Module Type</label>
                  <select
                    value={testType}
                    onChange={(e) => setTestType(e.target.value as TestingModuleType)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                  >
                    <option value="EXPLORATORY">Exploratory Testing</option>
                    <option value="REGRESSION">Regression Testing</option>
                    <option value="BUG_REPRODUCTION">Bug Reproduction</option>
                    <option value="TEST_CASE">Test Case Execution</option>
                    <option value="USABILITY">Usability Inspection</option>
                    <option value="ACCESSIBILITY">Accessibility Verification</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Authorized Target URL *</label>
                  <input
                    type="text"
                    required
                    placeholder="http://127.0.0.1:4173"
                    value={targetUrl}
                    onChange={(e) => setFormTargetUrl(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Test Cycle Reference URL (Test IO)</label>
                <input
                  type="text"
                  placeholder="https://tester.test.io/tests/..."
                  value={cycleUrl}
                  onChange={(e) => setCycleUrl(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-300 font-mono text-xs focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Test Description & Goal *</label>
                <textarea
                  required
                  rows={3}
                  placeholder="Describe the test objective and key interaction flow..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">In-Scope Requirements</label>
                  <textarea
                    rows={2}
                    value={inScope}
                    onChange={(e) => setInScope(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Out-of-Scope Boundaries</label>
                  <textarea
                    rows={2}
                    value={outOfScope}
                    onChange={(e) => setOutOfScope(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Device Requirements</label>
                <input
                  type="text"
                  value={deviceReq}
                  onChange={(e) => setDeviceReq(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              {/* Execution Permission Checkbox */}
              <div className="p-3 bg-blue-950/30 border border-blue-700/40 rounded-lg flex items-start gap-2.5">
                <input
                  type="checkbox"
                  id="permCheck"
                  checked={permissionConfirmed}
                  onChange={(e) => setPermissionConfirmed(e.target.checked)}
                  className="mt-0.5 rounded text-blue-500 focus:ring-0"
                />
                <label htmlFor="permCheck" className="text-slate-300 cursor-pointer leading-tight">
                  <b className="text-white">Compliance Acknowledgment:</b> I confirm that I am authorized by the customer to test this application. <span className="text-slate-400 text-[11px] block mt-0.5">Note: Autonomous AI execution requires a verified domain authorization record in Workspace or Settings (default-deny policy).</span>
                </label>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowImportModal(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg font-semibold transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-semibold transition-colors flex items-center gap-1.5 shadow-lg shadow-emerald-600/20"
                >
                  {isSubmitting ? 'Analyzing & Saving...' : 'Save & Propose Plan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
