import React from 'react';
import { useStudioStore } from './store';
import { Dashboard } from './components/Dashboard';
import { TestInbox } from './components/TestInbox';
import { TestWorkspace } from './components/TestWorkspace';
import { Settings } from './components/Settings';
import { 
  LayoutDashboard, 
  Inbox, 
  Terminal, 
  FileCheck, 
  Settings as SettingsIcon,
  ShieldAlert
} from 'lucide-react';

export const App: React.FC = () => {
  const { currentTab, setTab } = useStudioStore();

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'inbox', label: 'Test Inbox', icon: Inbox },
    { id: 'workspace', label: 'Workspace', icon: Terminal },
    { id: 'settings', label: 'Settings', icon: SettingsIcon }
  ];

  return (
    <div className="flex h-screen w-screen bg-[#070a12] text-slate-100 overflow-hidden font-sans">
      {/* Sidebar */}
      <aside className="w-64 bg-[#0d1222] border-r border-slate-800/80 flex flex-col justify-between p-4 z-20">
        <div className="space-y-6">
          {/* Brand */}
          <div className="flex items-center gap-3 px-2 pt-2">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 to-cyan-500 flex items-center justify-center shadow-lg shadow-blue-500/20 text-lg">
              🛡️
            </div>
            <div>
              <div className="font-bold text-sm tracking-wide text-white">Agent Studio</div>
              <div className="text-[10px] text-blue-400 font-medium">Test IO QA Automation</div>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setTab(item.id as any)}
                  className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                    isActive
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Bottom Safety Status */}
        <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 text-[11px] space-y-1 text-slate-400">
          <div className="flex items-center gap-1.5 text-emerald-400 font-semibold">
            <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
            Permission Guard Active
          </div>
          <div>Shell & Registry: <b>BLOCKED</b></div>
          <div>External Test IO: <b>RESTRICTED</b></div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col h-full overflow-hidden bg-[#070a12]">
        {currentTab === 'dashboard' && <Dashboard />}
        {currentTab === 'inbox' && <TestInbox />}
        {currentTab === 'workspace' && <TestWorkspace />}
        {currentTab === 'settings' && <Settings />}
      </main>
    </div>
  );
};
