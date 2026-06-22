import React from 'react';

export default function TopNav({ activeCount, pausedCount, onlineCount, offlineCount, errorMessage }) {
  return (
    <header className="bg-primary-container text-on-primary flex justify-between items-center px-gutter py-sm w-full border-b border-outline-variant fixed top-0 z-50">
      <div className="flex items-center gap-md">
        <span className="material-symbols-outlined text-secondary-fixed-dim" style={{ fontVariationSettings: "'FILL' 1" }}>local_shipping</span>
        <div>
          <h1 className="font-headline-md text-headline-md font-bold text-on-primary m-0 leading-tight">Cement Dispatch</h1>
          <p className="font-label-sm text-label-sm opacity-60 m-0 leading-tight">Conveyor belt monitoring & loading audits</p>
        </div>
      </div>
      <div className="hidden md:flex items-center gap-lg">
        {errorMessage && (
          <div className="flex items-center gap-sm bg-error-container text-on-error-container px-sm py-xs rounded font-label-md text-label-md">
            <span className="material-symbols-outlined text-[16px]">error</span>
            {errorMessage}
          </div>
        )}
        <div className="flex items-center gap-sm">
          <div className={`w-2 h-2 rounded-full bg-secondary-fixed-dim ${activeCount > 0 ? 'animate-pulse' : ''}`} style={{ opacity: activeCount > 0 ? 1 : 0.6 }}></div>
          <span className="font-label-md text-label-md text-secondary-fixed-dim">{activeCount} running</span>
        </div>
        <div className="flex items-center gap-sm">
          <div className="w-2 h-2 rounded-full bg-tertiary-fixed"></div>
          <span className="font-label-md text-label-md text-tertiary-fixed">{pausedCount} paused</span>
        </div>
        <div className="flex items-center gap-sm">
          <div className={`w-2 h-2 rounded-full ${offlineCount > 0 ? 'bg-error' : 'bg-secondary-fixed-dim'}`}></div>
          <span className={`font-label-md text-label-md ${offlineCount > 0 ? 'text-error' : 'text-secondary-fixed-dim'}`}>
            {onlineCount}/25 online
          </span>
        </div>
        <div className="flex gap-md ml-lg">
          <span className="material-symbols-outlined cursor-pointer hover:opacity-80 transition-all" title="Notifications">notifications</span>
          <span className="material-symbols-outlined cursor-pointer hover:opacity-80 transition-all" title="Settings">settings</span>
        </div>
      </div>
    </header>
  );
}
