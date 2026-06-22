import React from 'react';

export default function AuditLog({ sessions, formatTime, formatDuration }) {
  return (
    <div className="max-w-7xl mx-auto w-full">
      <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
        <div className="px-lg py-md border-b border-slate-200 flex justify-between items-center bg-slate-50/50">
          <div className="flex items-center gap-sm">
            <span className="material-symbols-outlined text-on-surface-variant" style={{ fontVariationSettings: "'FILL' 1" }}>history_edu</span>
            <h2 className="font-headline-sm text-headline-sm text-on-surface font-bold tracking-tight">Current Shift Audits</h2>
          </div>
          <div className="flex items-center gap-sm">
            <span className="font-label-md text-label-md text-on-surface-variant opacity-70">{sessions.length} records this shift</span>
          </div>
        </div>

        {sessions.length === 0 ? (
          <div className="text-center py-12 text-on-surface-variant">
            <span className="material-symbols-outlined" style={{ fontSize: '48px', opacity: 0.3 }}>database</span>
            <p className="font-body-md mt-2">No belts have been stopped during this shift yet.</p>
            <p className="font-body-sm mt-1 opacity-70">Stopped belts (even with 0 bags) will appear here.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="px-lg py-md font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider">ID</th>
                  <th className="px-lg py-md font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider">Belt</th>
                  <th className="px-lg py-md font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider">Start Time</th>
                  <th className="px-lg py-md font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider">End Time</th>
                  <th className="px-lg py-md font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider">Bags</th>
                  <th className="px-lg py-md font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider">Duration</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sessions.map(s => (
                  <tr key={s.id} className="hover:bg-slate-50 transition-colors group">
                    <td className="px-lg py-md font-label-md text-label-md text-on-surface-variant">#{s.id}</td>
                    <td className="px-lg py-md font-body-md text-body-md font-bold text-on-surface uppercase">{s.belt_id.replace('_', ' ')}</td>
                    <td className="px-lg py-md font-label-md text-label-md text-on-surface-variant">{formatTime(s.start_time)}</td>
                    <td className="px-lg py-md font-label-md text-label-md text-on-surface-variant">{formatTime(s.end_time)}</td>
                    <td className="px-lg py-md">
                      <span className={`inline-flex items-center justify-center px-sm py-xs font-label-sm text-label-sm rounded-sm min-w-[32px] ${s.total_count > 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                        {s.total_count}
                      </span>
                    </td>
                    <td className="px-lg py-md font-label-md text-label-md text-on-surface-variant">{formatDuration(s.end_time - s.start_time)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {sessions.length > 0 && (
        <div className="mt-lg grid grid-cols-1 md:grid-cols-3 gap-md">
          <div className="bg-white border border-slate-200 p-md rounded-lg flex items-center gap-md">
            <div className="w-10 h-10 rounded-sm bg-slate-100 flex items-center justify-center text-on-surface">
              <span className="material-symbols-outlined">speed</span>
            </div>
            <div>
              <p className="font-label-sm text-label-sm text-on-surface-variant uppercase">Average Duration</p>
              <p className="font-headline-sm text-headline-sm font-bold text-on-surface">
                {sessions.length > 0 ? formatDuration(sessions.reduce((acc, s) => acc + (s.end_time - s.start_time), 0) / sessions.length) : '0s'}
              </p>
            </div>
          </div>
          <div className="bg-white border border-slate-200 p-md rounded-lg flex items-center gap-md">
            <div className="w-10 h-10 rounded-sm bg-slate-100 flex items-center justify-center text-on-surface">
              <span className="material-symbols-outlined">inventory_2</span>
            </div>
            <div>
              <p className="font-label-sm text-label-sm text-on-surface-variant uppercase">Total Bags Processed</p>
              <p className="font-headline-sm text-headline-sm font-bold text-on-surface">
                {sessions.reduce((acc, s) => acc + s.total_count, 0).toLocaleString()}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
