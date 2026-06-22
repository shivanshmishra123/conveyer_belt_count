import React from 'react';

export default function LiveMonitor({ beltStatuses, activeCount, pausedCount, sessions, shiftData, lastShift, handleControl, formatDuration }) {
  const beltList = Object.values(beltStatuses);

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-md mb-xl">
        <div className="bg-surface-container-lowest border border-outline-variant p-md flex items-center gap-md rounded-lg">
          <div className="w-12 h-12 bg-emerald-50 rounded flex items-center justify-center text-emerald-600">
            <span className="material-symbols-outlined" style={{ fontVariationSettings: "'wght' 600" }}>monitoring</span>
          </div>
          <div>
            <p className="font-label-sm text-label-sm text-on-surface-variant uppercase opacity-70">Running Belts</p>
            <p className="font-headline-md text-headline-md font-bold">{activeCount} / 25</p>
          </div>
        </div>

        <div className="bg-surface-container-lowest border border-outline-variant p-md flex items-center gap-md rounded-lg">
          <div className="w-12 h-12 bg-orange-50 rounded flex items-center justify-center text-orange-600">
            <span className="material-symbols-outlined" style={{ fontVariationSettings: "'wght' 600" }}>pause_circle</span>
          </div>
          <div>
            <p className="font-label-sm text-label-sm text-on-surface-variant uppercase opacity-70">Paused Belts</p>
            <p className="font-headline-md text-headline-md font-bold">{pausedCount} / 25</p>
          </div>
        </div>

        <div className="bg-surface-container-lowest border border-outline-variant p-md flex items-center gap-md rounded-lg">
          <div className="w-12 h-12 bg-blue-50 rounded flex items-center justify-center text-blue-600">
            <span className="material-symbols-outlined" style={{ fontVariationSettings: "'wght' 600" }}>check_circle</span>
          </div>
          <div>
            <p className="font-label-sm text-label-sm text-on-surface-variant uppercase opacity-70">Completed Sessions</p>
            <p className="font-headline-md text-headline-md font-bold">{sessions.length}</p>
          </div>
        </div>

        <div className="bg-surface-container-lowest border border-outline-variant p-md flex items-center gap-md rounded-lg">
          <div className="w-12 h-12 bg-purple-50 rounded flex items-center justify-center text-purple-600">
            <span className="material-symbols-outlined" style={{ fontVariationSettings: "'wght' 600" }}>inventory_2</span>
          </div>
          <div>
            <p className="font-label-sm text-label-sm text-on-surface-variant uppercase opacity-70">Bags (Current Shift)</p>
            <p className="font-headline-md text-headline-md font-bold">
              {shiftData?.shift_status === 'active' ? shiftData.total_bags_so_far : (lastShift?.total_bags ?? 0)}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-md">
        {Array.from({ length: 25 }, (_, i) => {
          const beltId = `belt_${String(i + 1).padStart(2, '0')}`;
          const belt = beltStatuses[beltId] || { status: 'idle', live_count: 0, active_duration: 0, is_online: false };

          let statusBadge = <span className="font-label-sm text-label-sm bg-surface-container-low px-xs py-0.5 rounded text-on-surface-variant/60 uppercase">OFFLINE</span>;
          if (belt.is_online) {
            if (belt.status === 'running') {
              statusBadge = <span className="font-label-sm text-label-sm bg-emerald-100 text-emerald-800 px-xs py-0.5 rounded uppercase">RUNNING</span>;
            } else if (belt.status === 'paused') {
              statusBadge = <span className="font-label-sm text-label-sm bg-orange-100 text-orange-800 px-xs py-0.5 rounded uppercase">PAUSED</span>;
            } else {
              statusBadge = <span className="font-label-sm text-label-sm bg-surface-container-low px-xs py-0.5 rounded text-on-surface-variant uppercase">IDLE</span>;
            }
          }

          return (
            <div key={beltId} className="bg-surface-container-lowest border border-outline-variant p-md rounded flex flex-col gap-sm relative overflow-hidden group hover:border-outline transition-colors">
              <div className="flex justify-between items-start mb-xs">
                <div className="flex items-center gap-xs">
                  <span className={`w-2 h-2 rounded-full ${belt.is_online ? 'bg-emerald-500' : 'bg-red-500'}`}></span>
                  <span className="font-label-md text-label-md font-bold uppercase">{beltId.replace('_', ' ')}</span>
                </div>
                {statusBadge}
              </div>
              
              <div className="space-y-base py-sm">
                <div className="flex justify-between text-body-sm font-body-sm text-on-surface-variant">
                  <span className="opacity-60 flex items-center gap-xs">
                    <span className="material-symbols-outlined text-[14px]">schedule</span> Time
                  </span>
                  <span className="font-label-md">{formatDuration(belt.active_duration)}</span>
                </div>
                <div className="flex justify-between text-body-sm font-body-sm text-on-surface-variant">
                  <span className="opacity-60">Bags</span>
                  <span className={`font-label-md ${belt.live_count > 0 ? 'text-emerald-600' : ''}`}>{belt.live_count}</span>
                </div>
              </div>

              {!belt.is_online && (
                <div className="bg-red-50 border border-red-100 p-xs rounded flex items-center gap-xs text-red-700 text-[11px] font-label-sm">
                  <span className="material-symbols-outlined text-[14px]">warning</span>
                  <span>Edge node offline</span>
                </div>
              )}

              <div className="mt-sm grid grid-cols-2 gap-xs">
                {belt.status === 'idle' ? (
                  <button
                    onClick={() => handleControl(beltId, 'start')}
                    className="col-span-2 w-full bg-emerald-600 hover:bg-emerald-700 text-white font-label-sm text-label-sm py-sm rounded flex items-center justify-center gap-xs transition-colors"
                  >
                    <span className="material-symbols-outlined text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }}>play_arrow</span> Start
                  </button>
                ) : (
                  <>
                    {belt.status === 'running' ? (
                      <button
                        onClick={() => handleControl(beltId, 'pause')}
                        className="bg-orange-500 hover:bg-orange-600 text-white font-label-sm text-label-sm py-sm rounded flex items-center justify-center gap-xs transition-colors"
                      >
                        <span className="material-symbols-outlined text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }}>pause</span> Pause
                      </button>
                    ) : (
                      <button
                        onClick={() => handleControl(beltId, 'resume')}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white font-label-sm text-label-sm py-sm rounded flex items-center justify-center gap-xs transition-colors"
                      >
                        <span className="material-symbols-outlined text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }}>play_arrow</span> Resume
                      </button>
                    )}
                    <button
                      onClick={() => handleControl(beltId, 'complete')}
                      className="bg-red-600 hover:bg-red-700 text-white font-label-sm text-label-sm py-sm rounded flex items-center justify-center gap-xs transition-colors"
                    >
                      <span className="material-symbols-outlined text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }}>stop</span> Stop
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
