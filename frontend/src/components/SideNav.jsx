import React from 'react';

const NAV_ITEMS = [
  { id: 'live', label: 'Live Monitor', icon: 'monitoring' },
  { id: 'shift', label: 'Shift Summary', icon: 'assignment' },
  { id: 'audit', label: 'Audit Log', icon: 'history_edu' },
  { id: 'health', label: 'System Health', icon: 'health_and_safety' }
];

export default function SideNav({ activeTab, setActiveTab }) {
  return (
    <nav className="fixed left-0 top-0 h-full flex flex-col p-md gap-sm bg-primary-container border-r border-outline-variant pt-24 w-64 hidden md:flex z-40">
      <div className="mb-lg px-xs">
        <h2 className="font-headline-sm text-headline-sm font-black text-on-primary">Control Center</h2>
        <p className="font-body-sm text-body-sm opacity-60 text-on-primary">Terminal 01</p>
      </div>
      
      {NAV_ITEMS.map(item => {
        const isActive = activeTab === item.id;
        if (isActive) {
          return (
            <button key={item.id} className="flex items-center gap-sm p-sm bg-secondary text-on-secondary rounded-lg border-l-4 border-secondary-fixed-dim text-left w-full">
              <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>{item.icon}</span>
              <span className="font-label-md text-label-md">{item.label}</span>
            </button>
          );
        } else {
          return (
            <button key={item.id} onClick={() => setActiveTab(item.id)} className="flex items-center gap-sm p-sm text-on-primary-container opacity-60 hover:opacity-100 hover:bg-primary-fixed-variant transition-all duration-150 rounded-lg text-left w-full group">
              <span className="material-symbols-outlined">{item.icon}</span>
              <span className="font-label-md text-label-md">{item.label}</span>
            </button>
          );
        }
      })}

      <div className="mt-auto pt-md border-t border-outline-variant flex flex-col gap-sm">
        <button className="flex items-center gap-sm p-sm text-on-primary-container opacity-60 hover:opacity-100 transition-all rounded-lg text-left w-full">
          <span className="material-symbols-outlined">logout</span>
          <span className="font-label-md text-label-md">Logout</span>
        </button>
      </div>
    </nav>
  );
}
