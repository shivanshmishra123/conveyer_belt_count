import React from 'react';

export default function ShiftSummary({ shiftData, lastShift, allShifts, selectedShift, setSelectedShift, fetchShiftDetail, formatDuration, formatDateTime, formatTime }) {
  return (
    <div className="max-w-[1400px] w-full mx-auto space-y-lg">
      {/* Active Shift Panel */}
      {shiftData?.shift_status === 'active' ? (
        <>
          <section className="bg-white border border-outline-variant p-lg rounded-lg flex justify-between items-center">
            <div className="flex items-center gap-md">
              <div className="relative">
                <div className="w-3 h-3 bg-secondary-fixed-dim rounded-full animate-pulse"></div>
                <div className="absolute inset-0 bg-secondary-fixed-dim rounded-full blur-sm opacity-50"></div>
              </div>
              <div>
                <h3 className="font-label-sm text-label-sm text-secondary uppercase tracking-widest mb-1">Shift In Progress</h3>
                <div className="flex items-center gap-sm font-headline-sm text-headline-sm font-semibold">
                  <span>{shiftData.belts_active} belt{shiftData.belts_active !== 1 ? 's' : ''} active</span>
                  <span className="text-outline-variant">•</span>
                  <span className="font-label-md mono">{formatDuration(shiftData.shift_start_time ? Date.now() / 1000 - shiftData.shift_start_time : 0)} elapsed</span>
                </div>
              </div>
            </div>
            <div className="text-right">
              <h3 className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-widest mb-1">Total Bags So Far</h3>
              <div className="font-display-lg text-display-lg font-black text-secondary-fixed-dim mono">{shiftData.total_bags_so_far}</div>
            </div>
          </section>

          {Object.keys(shiftData.per_belt).length > 0 && (
            <section className="space-y-md">
              <h2 className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-widest">Belt-Wise Count (Live)</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-md">
                {Object.entries(shiftData.per_belt).sort((a, b) => b[1] - a[1]).map(([id, count]) => (
                  <div key={id} className="bg-white border border-outline-variant p-md rounded flex flex-col items-center justify-center min-h-[120px] hover:border-secondary transition-colors cursor-pointer group">
                    <div className="font-label-sm text-label-sm text-outline mb-2 group-hover:text-secondary transition-colors uppercase">{id.replace('_', ' ')}</div>
                    <div className="font-display-lg text-display-lg font-bold mono text-on-surface">{count}</div>
                    <div className="font-label-sm text-label-sm text-outline-variant mt-1">bags</div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      ) : lastShift ? (
        <section className="bg-white border border-outline-variant p-lg rounded-lg flex justify-between items-center bg-surface-container-low">
          <div className="flex items-center gap-md">
            <span className="material-symbols-outlined text-secondary" style={{ fontSize: '32px' }}>check_circle</span>
            <div>
              <h3 className="font-label-sm text-label-sm text-secondary uppercase tracking-widest mb-1">Last Shift Complete</h3>
              <div className="flex items-center gap-sm font-headline-sm text-headline-sm font-semibold">
                <span className="font-label-md mono">Duration: {formatDuration(lastShift.duration_secs)}</span>
              </div>
            </div>
          </div>
          <div className="text-right">
            <h3 className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-widest mb-1">Total Bags Loaded</h3>
            <div className="font-display-lg text-display-lg font-black text-secondary mono">{lastShift.total_bags.toLocaleString()}</div>
          </div>
        </section>
      ) : (
        <div className="bg-surface-container-lowest border border-outline-variant rounded-lg p-12 text-center text-on-surface-variant">
          <span className="material-symbols-outlined" style={{ fontSize: '48px', opacity: 0.2 }}>inventory_2</span>
          <p className="font-headline-sm mt-3">No shifts completed yet.</p>
          <p className="font-body-sm mt-1 opacity-70">Start belts to begin a shift. The summary will appear here when all belts are stopped.</p>
        </div>
      )}

      {selectedShift ? (
        <section className="bg-white border border-outline-variant rounded-lg overflow-hidden space-y-md p-lg">
          <button onClick={() => setSelectedShift(null)} className="flex items-center gap-sm text-secondary hover:opacity-80 transition-opacity font-label-sm text-label-sm uppercase tracking-widest mb-lg">
            <span className="material-symbols-outlined text-[16px]">arrow_back</span> Back to Shift History
          </button>
          
          <div className="bg-surface-container-low border border-outline-variant p-md rounded flex justify-between items-center">
            <div>
              <p className="font-label-sm text-label-sm text-secondary uppercase tracking-widest">Shift #{selectedShift.id}</p>
              <p className="font-headline-sm text-headline-sm font-bold mt-1">{formatDateTime(selectedShift.start_time)}</p>
              <p className="font-body-sm text-on-surface-variant mt-0.5">Duration: {formatDuration(selectedShift.duration_secs)}</p>
            </div>
            <div className="text-right">
              <p className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-widest">Total Bags</p>
              <p className="font-display-lg text-display-lg font-black text-secondary">{selectedShift.total_bags.toLocaleString()}</p>
            </div>
          </div>

          <div>
            <p className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-widest mb-4 mt-lg">Belt-wise Contribution</p>
            <div className="overflow-x-auto border border-outline-variant rounded">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-surface-container border-b border-outline-variant">
                    <th className="px-md py-3 font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider">Rank</th>
                    <th className="px-md py-3 font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider">Belt</th>
                    <th className="px-md py-3 font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider text-right">Bags</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant">
                  {Object.entries(selectedShift.belt_summary).sort((a, b) => b[1] - a[1]).map(([id, count], idx) => (
                    <tr key={id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-md py-3 font-label-md text-label-md text-on-surface-variant">#{idx + 1}</td>
                      <td className="px-md py-3 font-body-md text-body-md font-bold uppercase">{id.replace('_', ' ')}</td>
                      <td className={`px-md py-3 font-body-md text-body-md text-right font-bold mono ${count > 0 ? 'text-secondary' : 'text-on-surface-variant'}`}>{count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      ) : (
        <section className="bg-white border border-outline-variant rounded-lg overflow-hidden mt-xl">
          <header className="p-md border-b border-outline-variant flex justify-between items-center bg-surface-container-low">
            <div className="flex items-center gap-sm">
              <span className="material-symbols-outlined text-on-surface-variant">bar_chart</span>
              <h2 className="font-headline-sm text-headline-sm font-bold">Shift History</h2>
            </div>
            <div className="font-label-sm text-label-sm text-on-surface-variant">{allShifts.length} shifts recorded</div>
          </header>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-surface-container border-b border-outline-variant">
                  <th className="px-md py-3 font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider">Shift #</th>
                  <th className="px-md py-3 font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider">Date & Time</th>
                  <th className="px-md py-3 font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider text-center">Belts Active</th>
                  <th className="px-md py-3 font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider text-center">Duration</th>
                  <th className="px-md py-3 font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider text-right">Total Bags</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant">
                {allShifts.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="px-md py-8 text-center font-body-md text-on-surface-variant">No historical shifts yet.</td>
                  </tr>
                ) : (
                  allShifts.map((shift) => (
                    <tr key={shift.id} onClick={() => fetchShiftDetail(shift.id)} className="hover:bg-slate-50 transition-colors cursor-pointer group">
                      <td className="px-md py-4 font-body-md text-body-md text-on-surface-variant group-hover:text-secondary">#{shift.id}</td>
                      <td className="px-md py-4 font-body-md text-body-md font-medium">{formatDateTime(shift.start_time)}</td>
                      <td className="px-md py-4 font-body-md text-body-md text-center mono">{shift.belts_active}</td>
                      <td className="px-md py-4 font-body-md text-body-md text-center mono">{formatDuration(shift.duration_secs)}</td>
                      <td className="px-md py-4 font-body-md text-body-md text-right font-bold text-secondary mono">{shift.total_bags.toLocaleString()}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
