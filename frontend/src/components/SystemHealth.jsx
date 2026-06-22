import React from 'react';

export default function SystemHealth({ onlineCount, offlineCount, activeCount, sortedBelts, formatDuration, timeAgo }) {
  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-md mb-xl">
        <div className="bg-surface-container-lowest border border-outline-variant p-md rounded-lg flex items-center gap-md">
          <div className="w-12 h-12 rounded bg-surface-container-high flex items-center justify-center">
            <span className="material-symbols-outlined text-secondary opacity-40">wifi</span>
          </div>
          <div>
            <p className="font-label-sm text-label-sm text-on-surface-variant uppercase">Online Nodes</p>
            <p className="font-display-lg text-display-lg text-secondary">{onlineCount}</p>
          </div>
        </div>

        <div className="bg-surface-container-lowest border border-outline-variant p-md rounded-lg flex items-center gap-md">
          <div className="w-12 h-12 rounded bg-surface-container-high flex items-center justify-center">
            <span className="material-symbols-outlined text-error opacity-40">wifi_off</span>
          </div>
          <div>
            <p className="font-label-sm text-label-sm text-on-surface-variant uppercase">Offline Nodes</p>
            <p className="font-display-lg text-display-lg text-error">{offlineCount}</p>
          </div>
        </div>

        <div className="bg-surface-container-lowest border border-outline-variant p-md rounded-lg flex items-center gap-md">
          <div className="w-12 h-12 rounded bg-surface-container-high flex items-center justify-center">
            <span className="material-symbols-outlined text-secondary opacity-40">pause</span>
          </div>
          <div>
            <p className="font-label-sm text-label-sm text-on-surface-variant uppercase">Currently Active</p>
            <p className="font-display-lg text-display-lg text-secondary">{activeCount}</p>
          </div>
        </div>

        <div className="bg-surface-container-lowest border border-outline-variant p-md rounded-lg flex items-center gap-md">
          <div className="w-12 h-12 rounded bg-surface-container-high flex items-center justify-center">
            <span className="material-symbols-outlined text-error opacity-40">storage</span>
          </div>
          <div>
            <p className="font-label-sm text-label-sm text-on-surface-variant uppercase">System Status</p>
            <p className={`font-display-lg text-display-lg ${offlineCount === 0 ? 'text-secondary' : 'text-error'}`}>
              {offlineCount === 0 ? 'Healthy' : `${offlineCount} down`}
            </p>
          </div>
        </div>
      </div>

      <div className="bg-surface-container-lowest border border-outline-variant rounded-lg overflow-hidden">
        <div className="px-md py-md border-b border-outline-variant flex justify-between items-center bg-white">
          <div className="flex items-center gap-sm">
            <span className="material-symbols-outlined text-secondary-fixed-dim">dns</span>
            <h3 className="font-headline-sm text-headline-sm">Edge Node Status</h3>
          </div>
          <span className="font-label-sm text-label-sm opacity-60">Offline nodes listed first</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-surface-container-low border-b border-outline-variant">
                <th className="px-md py-sm font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider">Belt</th>
                <th className="px-md py-sm font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider">Connectivity</th>
                <th className="px-md py-sm font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider">Session</th>
                <th className="px-md py-sm font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider text-right">Bags (Live)</th>
                <th className="px-md py-sm font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider text-right">Active Time</th>
                <th className="px-md py-sm font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider text-right">Last Heartbeat</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant">
              {sortedBelts.map(belt => {
                let statusBadge = <span className="px-2 py-0.5 bg-surface-container-high text-on-surface-variant rounded-sm font-label-sm text-label-sm uppercase">Idle</span>;
                if (belt.status === 'running') {
                  statusBadge = <span className="px-2 py-0.5 bg-secondary-container text-on-secondary-container rounded-sm font-label-sm text-label-sm uppercase">Running</span>;
                } else if (belt.status === 'paused') {
                  statusBadge = <span className="px-2 py-0.5 bg-yellow-100 text-yellow-800 rounded-sm font-label-sm text-label-sm uppercase">Paused</span>;
                }

                return (
                  <tr key={belt.belt_id} className={`hover:bg-surface-container transition-colors ${!belt.is_online ? 'bg-red-50/50' : ''}`}>
                    <td className="px-md py-sm font-label-md text-label-md font-bold uppercase">{belt.belt_id.replace('_', ' ')}</td>
                    <td className="px-md py-sm">
                      <div className={`flex items-center gap-sm ${belt.is_online ? 'text-secondary' : 'text-error'}`}>
                        <div className={`w-1.5 h-1.5 rounded-full ${belt.is_online ? 'bg-secondary animate-pulse' : 'bg-error'}`}></div>
                        <span className="font-label-sm text-label-sm uppercase">{belt.is_online ? 'Online' : 'Offline'}</span>
                      </div>
                    </td>
                    <td className="px-md py-sm">{statusBadge}</td>
                    <td className="px-md py-sm font-label-md text-label-md text-right text-secondary">{belt.live_count}</td>
                    <td className="px-md py-sm font-label-md text-label-md text-right opacity-60">{formatDuration(belt.active_duration)}</td>
                    <td className="px-md py-sm font-label-md text-label-md text-right opacity-40">{belt.last_heartbeat ? timeAgo(belt.last_heartbeat) : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
