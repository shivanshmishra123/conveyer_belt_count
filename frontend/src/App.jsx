import React, { useState, useEffect } from 'react';
import {
  Play, Pause, CheckCircle, Activity, Clock, Database,
  AlertTriangle, FileText, Truck, BarChart2, Monitor,
  Package, Server, Wifi, WifiOff
} from 'lucide-react';

const BACKEND_URL = 'http://127.0.0.1:8000';

const TABS = [
  { id: 'live',   label: 'Live Monitor',   icon: Monitor  },
  { id: 'shift',  label: 'Shift Summary',  icon: Package  },
  { id: 'audit',  label: 'Audit Log',      icon: FileText },
  { id: 'health', label: 'System Health',  icon: Server   },
];

export default function App() {
  // ── State ──────────────────────────────────────────────────────────────
  const [activeTab,     setActiveTab]     = useState('live');
  const [beltStatuses,  setBeltStatuses]  = useState({});
  const [sessions,      setSessions]      = useState([]);
  const [shiftData,     setShiftData]     = useState(null);
  const [lastShift,     setLastShift]     = useState(null);
  const [allShifts,     setAllShifts]     = useState([]);
  const [errorMessage,  setErrorMessage]  = useState('');

  // ── Helpers ────────────────────────────────────────────────────────────
  const formatDuration = (secs) => {
    if (secs === undefined || secs === null || isNaN(secs)) return '00:00';
    const m = Math.floor(Math.abs(secs) / 60);
    const s = Math.floor(Math.abs(secs) % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const formatTime = (ts) =>
    ts ? new Date(ts * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'N/A';

  const formatDateTime = (ts) =>
    ts ? new Date(ts * 1000).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'N/A';

  const timeAgo = (ts) => {
    if (!ts) return '—';
    const s = Math.floor(Date.now() / 1000 - parseFloat(ts));
    if (s < 5)    return 'just now';
    if (s < 60)   return `${s}s ago`;
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    return `${Math.floor(s / 3600)}h ago`;
  };

  // ── Fetch Functions ────────────────────────────────────────────────────
  const fetchAllStatuses = async () => {
    try {
      const results = await Promise.all(
        Array.from({ length: 25 }, (_, i) => {
          const id = `belt_${String(i + 1).padStart(2, '0')}`;
          return fetch(`${BACKEND_URL}/api/v1/session/status/${id}`)
            .then(r => r.ok ? r.json() : Promise.reject())
            .catch(() => ({ belt_id: id, status: 'idle', live_count: 0, active_duration: 0, is_online: false, last_heartbeat: null }));
        })
      );
      const map = {};
      results.forEach(r => { map[r.belt_id] = r; });
      setBeltStatuses(map);
      setErrorMessage('');
    } catch {
      setErrorMessage('Could not connect to FastAPI backend. Check services.');
    }
  };

  const fetchSessions = async () => {
    try {
      const r = await fetch(`${BACKEND_URL}/api/v1/sessions`);
      if (r.ok) setSessions((await r.json()).sessions || []);
    } catch {}
  };

  const fetchShiftCurrent = async () => {
    try {
      const r = await fetch(`${BACKEND_URL}/api/v1/shift/current`);
      if (r.ok) {
        const data = await r.json();
        setShiftData(data);
        if (data.shift_status === 'idle') fetchLastShift();
      }
    } catch {}
  };

  const fetchLastShift = async () => {
    try {
      const r = await fetch(`${BACKEND_URL}/api/v1/shift/last`);
      if (r.ok) setLastShift((await r.json()).shift || null);
    } catch {}
  };

  const fetchAllShifts = async () => {
    try {
      const r = await fetch(`${BACKEND_URL}/api/v1/shifts`);
      if (r.ok) setAllShifts((await r.json()).shifts || []);
    } catch {}
  };

  // ── Effects ────────────────────────────────────────────────────────────
  useEffect(() => {
    fetchAllStatuses();
    fetchSessions();
    fetchShiftCurrent();
    fetchAllShifts();

    const t1 = setInterval(fetchAllStatuses,  5000);
    const t2 = setInterval(fetchSessions,      5000);
    const t3 = setInterval(fetchShiftCurrent, 10000);
    const t4 = setInterval(fetchAllShifts,    60000);

    return () => [t1, t2, t3, t4].forEach(clearInterval);
  }, []);

  // Client-side timer for smooth active duration increment
  useEffect(() => {
    const tick = setInterval(() => {
      setBeltStatuses(prev => {
        const next = { ...prev };
        let changed = false;
        Object.keys(next).forEach(id => {
          if (next[id].status === 'running') {
            next[id] = { ...next[id], active_duration: next[id].active_duration + 1 };
            changed = true;
          }
        });
        return changed ? next : prev;
      });
    }, 1000);
    return () => clearInterval(tick);
  }, []);

  const handleControl = async (beltId, action) => {
    try {
      const r = await fetch(`${BACKEND_URL}/api/v1/session/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ belt_id: beltId }),
      });
      if (r.ok) { fetchAllStatuses(); fetchSessions(); fetchShiftCurrent(); }
      else { const d = await r.json(); alert(`Action failed: ${d.detail || d.message || 'Unknown error'}`); }
    } catch { alert('Network error. Could not reach API.'); }
  };

  // ── Computed ───────────────────────────────────────────────────────────
  const beltList     = Object.values(beltStatuses);
  const activeCount  = beltList.filter(b => b.status  === 'running').length;
  const pausedCount  = beltList.filter(b => b.status  === 'paused').length;
  const onlineCount  = beltList.filter(b => b.is_online).length;
  const offlineCount = 25 - onlineCount;

  const tabBadges = {
    live:   activeCount  ? { text: String(activeCount),  cls: 'bg-emerald-500/20 text-emerald-400' } : null,
    shift:  shiftData?.shift_status === 'active' ? { text: 'LIVE', cls: 'bg-emerald-500/20 text-emerald-400' } : null,
    audit:  null,
    health: offlineCount ? { text: String(offlineCount), cls: 'bg-rose-500/20 text-rose-400' } : null,
  };

  // Sorted belt list for health tab (offline first, then running, paused, idle)
  const sortedBelts = Array.from({ length: 25 }, (_, i) => {
    const id = `belt_${String(i + 1).padStart(2, '0')}`;
    return beltStatuses[id] || { belt_id: id, status: 'idle', live_count: 0, active_duration: 0, is_online: false, last_heartbeat: null };
  }).sort((a, b) => {
    if (a.is_online !== b.is_online) return a.is_online ? 1 : -1;
    const o = { running: 0, paused: 1, idle: 2 };
    return (o[a.status] ?? 2) - (o[b.status] ?? 2);
  });

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans">

      {/* ── HEADER ── */}
      <header className="border-b border-slate-800 bg-slate-950 px-6 py-4">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Truck className="h-8 w-8 text-sky-500 shrink-0" />
            <div>
              <h1 className="text-2xl font-extrabold tracking-tight text-white">Cement Dispatch</h1>
              <p className="text-xs text-slate-500">Conveyor belt monitoring &amp; loading audits</p>
            </div>
          </div>
          <div className="flex items-center gap-5 flex-wrap">
            <div className="flex items-center gap-4 text-sm font-semibold">
              <span className="flex items-center gap-1.5 text-emerald-400">
                <span className={`h-2 w-2 rounded-full bg-emerald-500 ${activeCount > 0 ? 'animate-pulse' : ''}`} />
                {activeCount} running
              </span>
              <span className="flex items-center gap-1.5 text-amber-400">
                <span className="h-2 w-2 rounded-full bg-amber-500" />
                {pausedCount} paused
              </span>
              <span className={`flex items-center gap-1.5 ${offlineCount > 0 ? 'text-rose-400' : 'text-sky-400'}`}>
                {offlineCount > 0 ? <WifiOff className="h-3.5 w-3.5" /> : <Wifi className="h-3.5 w-3.5" />}
                {onlineCount}/25 online
              </span>
            </div>
            {errorMessage && (
              <div className="flex items-center gap-2 bg-rose-950/50 border border-rose-900 text-rose-300 px-3 py-1.5 rounded-lg text-xs">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ── TAB BAR ── */}
      <nav className="border-b border-slate-800 bg-slate-950 sticky top-0 z-20 px-6">
        <div className="max-w-7xl mx-auto flex overflow-x-auto">
          {TABS.map(tab => {
            const badge  = tabBadges[tab.id];
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                id={`tab-${tab.id}`}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-5 py-3.5 text-sm font-semibold border-b-2 transition-all shrink-0 whitespace-nowrap ${
                  active
                    ? 'border-sky-500 text-sky-400'
                    : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-700'
                }`}
              >
                <tab.icon className="h-4 w-4" />
                {tab.label}
                {badge && (
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ml-0.5 ${badge.cls}`}>
                    {badge.text}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </nav>

      {/* ── CONTENT ── */}
      <main className="max-w-7xl mx-auto px-6 py-6 space-y-6">

        {/* ════════════════════════════════
             TAB 1 — LIVE MONITOR
            ════════════════════════════════ */}
        {activeTab === 'live' && (
          <>
            {/* Summary Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { icon: Activity,     label: 'Running Belts',       value: `${activeCount} / 25`, cls: 'text-emerald-400', bg: 'bg-emerald-500/10' },
                { icon: Pause,        label: 'Paused Belts',        value: `${pausedCount} / 25`, cls: 'text-amber-400',   bg: 'bg-amber-500/10'   },
                { icon: CheckCircle,  label: 'Completed Sessions',  value: sessions.length,       cls: 'text-sky-400',     bg: 'bg-sky-500/10'     },
                { icon: Database,     label: 'Bags (Current Shift)', value: shiftData?.shift_status === 'active' ? shiftData.total_bags_so_far : (lastShift?.total_bags ?? 0), cls: 'text-purple-400', bg: 'bg-purple-500/10' },
              ].map(({ icon: Icon, label, value, cls, bg }) => (
                <div key={label} className="bg-slate-900/50 border border-slate-800 rounded-xl p-5 flex items-center gap-4">
                  <div className={`p-3 rounded-lg ${bg} ${cls} shrink-0`}>
                    <Icon className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{label}</p>
                    <h3 className={`text-2xl font-black mt-0.5 ${cls}`}>{value}</h3>
                  </div>
                </div>
              ))}
            </div>

            {/* Belt Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {Array.from({ length: 25 }, (_, i) => {
                const beltId = `belt_${String(i + 1).padStart(2, '0')}`;
                const belt   = beltStatuses[beltId] || { status: 'idle', live_count: 0, active_duration: 0, is_online: false };

                let cardCls  = 'bg-slate-900/80 border-slate-800';
                let badgeCls = 'bg-slate-800/50 text-slate-400 border border-slate-700';
                if (belt.status === 'running') {
                  cardCls  = 'bg-emerald-950/20 border-emerald-800/60 shadow-lg shadow-emerald-950/20';
                  badgeCls = 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
                } else if (belt.status === 'paused') {
                  cardCls  = 'bg-amber-950/20 border-amber-800/60';
                  badgeCls = 'bg-amber-500/10 text-amber-400 border border-amber-500/20';
                }

                return (
                  <div key={beltId} className={`rounded-xl border p-4 flex flex-col justify-between transition-all duration-300 hover:scale-[1.02] ${cardCls}`}>
                    {/* Card Header */}
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-1.5">
                          <span className={`h-2.5 w-2.5 rounded-full ${belt.is_online ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
                          <span className="font-bold text-sm text-slate-300 uppercase">{beltId.replace('_', ' ')}</span>
                        </div>
                        <span className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full ${badgeCls}`}>
                          {belt.is_online ? belt.status : 'offline'}
                        </span>
                      </div>
                      {/* Stats */}
                      <div className="space-y-1.5 py-1.5">
                        <div className="flex justify-between items-center">
                          <span className="text-xs text-slate-400 flex items-center gap-1">
                            <Clock className="h-3 w-3" /> Time
                          </span>
                          <span className="text-xs font-mono text-slate-200">{formatDuration(belt.active_duration)}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-xs text-slate-400">Bags</span>
                          <span className="text-xs font-bold text-emerald-400">{belt.live_count}</span>
                        </div>
                      </div>
                    </div>

                    {/* Controls */}
                    <div className="mt-3 pt-3 border-t border-slate-800/60 flex flex-col gap-1.5">
                      {!belt.is_online && (
                        <div className="flex items-center gap-1 text-[10px] text-rose-400/80 bg-rose-950/20 border border-rose-900/30 rounded px-2 py-1">
                          <AlertTriangle className="h-3 w-3 shrink-0" /> Edge node offline
                        </div>
                      )}
                      <div className="flex gap-1.5">
                        {belt.status === 'idle' ? (
                          <button
                            id={`btn-start-${beltId}`}
                            onClick={() => handleControl(beltId, 'start')}
                            className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-1.5 rounded-lg text-xs flex items-center justify-center gap-1 transition-colors"
                          >
                            <Play className="h-3 w-3 fill-current" /> Start
                          </button>
                        ) : (
                          <>
                            {belt.status === 'running' ? (
                              <button
                                id={`btn-pause-${beltId}`}
                                onClick={() => handleControl(beltId, 'pause')}
                                className="flex-1 bg-amber-600 hover:bg-amber-500 text-white font-bold py-1.5 rounded-lg text-xs flex items-center justify-center gap-1 transition-colors"
                              >
                                <Pause className="h-3 w-3 fill-current" /> Pause
                              </button>
                            ) : (
                              <button
                                id={`btn-resume-${beltId}`}
                                onClick={() => handleControl(beltId, 'resume')}
                                className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-1.5 rounded-lg text-xs flex items-center justify-center gap-1 transition-colors"
                              >
                                <Play className="h-3 w-3 fill-current" /> Resume
                              </button>
                            )}
                            <button
                              id={`btn-stop-${beltId}`}
                              onClick={() => handleControl(beltId, 'complete')}
                              className="flex-1 bg-rose-600 hover:bg-rose-500 text-white font-bold py-1.5 rounded-lg text-xs flex items-center justify-center gap-1 transition-colors"
                            >
                              <CheckCircle className="h-3 w-3" /> Stop
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* ════════════════════════════════
             TAB 2 — SHIFT SUMMARY
            ════════════════════════════════ */}
        {activeTab === 'shift' && (
          <div className="space-y-6">

            {/* Active shift panel */}
            {shiftData?.shift_status === 'active' ? (
              <div className="space-y-4">
                <div className="bg-emerald-950/30 border border-emerald-800/50 rounded-2xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="h-3 w-3 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                    <div>
                      <p className="text-xs text-emerald-400 font-semibold uppercase tracking-wider">Shift In Progress</p>
                      <p className="text-white font-bold mt-0.5 text-lg">
                        {shiftData.belts_active} belt{shiftData.belts_active !== 1 ? 's' : ''} active
                        &nbsp;·&nbsp;
                        {formatDuration(shiftData.shift_start_time ? Date.now() / 1000 - shiftData.shift_start_time : 0)} elapsed
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Total Bags So Far</p>
                    <p className="text-4xl font-black text-emerald-400">{shiftData.total_bags_so_far}</p>
                  </div>
                </div>

                {Object.keys(shiftData.per_belt).length > 0 && (
                  <div className="bg-slate-900/30 border border-slate-800 rounded-2xl p-6">
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-4">Belt-wise Count (Live)</p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
                      {Object.entries(shiftData.per_belt).sort((a, b) => b[1] - a[1]).map(([id, count]) => (
                        <div key={id} className="bg-slate-800/50 rounded-lg px-3 py-2 text-center">
                          <span className="text-[10px] text-slate-400 uppercase font-semibold block">{id.replace('_', ' ')}</span>
                          <span className="text-xl font-black text-emerald-400">{count}</span>
                          <span className="text-[9px] text-slate-500 block">bags</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

            ) : lastShift ? (
              /* Last completed shift panel */
              <div className="space-y-4">
                <div className="bg-sky-950/30 border border-sky-800/40 rounded-2xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <CheckCircle className="h-7 w-7 text-sky-400 shrink-0" />
                    <div>
                      <p className="text-xs text-sky-400 font-semibold uppercase tracking-wider">Last Shift Complete</p>
                      <p className="text-white font-bold mt-0.5 text-lg">Duration: {formatDuration(lastShift.duration_secs)}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Total Bags Loaded</p>
                    <p className="text-4xl font-black text-sky-400">{lastShift.total_bags.toLocaleString()}</p>
                  </div>
                </div>

                {lastShift.belt_summary && Object.keys(lastShift.belt_summary).length > 0 && (
                  <div className="bg-slate-900/30 border border-slate-800 rounded-2xl p-6">
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-4">
                      Belt-wise Breakdown — {Object.keys(lastShift.belt_summary).length} belt{Object.keys(lastShift.belt_summary).length !== 1 ? 's' : ''} active
                    </p>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="border-b border-slate-800 text-slate-400 text-xs font-semibold uppercase">
                            <th className="py-3 px-4">Rank</th>
                            <th className="py-3 px-4">Belt</th>
                            <th className="py-3 px-4 text-right">Bags</th>
                            <th className="py-3 px-4 text-right">Share</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/50 text-sm text-slate-300">
                          {Object.entries(lastShift.belt_summary).sort((a, b) => b[1] - a[1]).map(([id, count], idx) => (
                            <tr key={id} className={`hover:bg-slate-900/20 transition-colors ${idx === 0 ? 'bg-sky-950/10' : ''}`}>
                              <td className="py-3 px-4 font-mono text-xs">
                                {idx === 0 ? '🥇 1' : idx === 1 ? '🥈 2' : idx === 2 ? '🥉 3' : `#${idx + 1}`}
                              </td>
                              <td className="py-3 px-4 font-bold text-white uppercase">{id.replace('_', ' ')}</td>
                              <td className="py-3 px-4 text-right font-black text-emerald-400 text-base">{count}</td>
                              <td className="py-3 px-4 text-right">
                                <div className="flex items-center justify-end gap-2">
                                  <div className="w-20 bg-slate-800 rounded-full h-1.5">
                                    <div className="bg-emerald-500 h-1.5 rounded-full" style={{ width: `${Math.round((count / lastShift.total_bags) * 100)}%` }} />
                                  </div>
                                  <span className="text-xs text-slate-400 font-mono w-8 text-right">
                                    {Math.round((count / lastShift.total_bags) * 100)}%
                                  </span>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>

            ) : (
              /* No shift ever */
              <div className="bg-slate-900/30 border border-slate-800 rounded-2xl p-12 text-center text-slate-500">
                <Package className="h-12 w-12 mx-auto mb-3 opacity-20" />
                <p className="font-semibold">No shifts completed yet.</p>
                <p className="text-sm mt-1 text-slate-600">Start belts to begin a shift. The summary will appear here when all belts are stopped.</p>
              </div>
            )}

            {/* All Shifts History */}
            <div className="bg-slate-900/30 border border-slate-800 rounded-2xl p-6">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <BarChart2 className="h-5 w-5 text-sky-400" /> Shift History
                </h2>
                <span className="text-xs text-slate-400 font-mono">{allShifts.length} shift{allShifts.length !== 1 ? 's' : ''} recorded</span>
              </div>
              {allShifts.length === 0 ? (
                <p className="text-center text-slate-500 py-8 text-sm">No historical shifts yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-800 text-slate-400 text-xs font-semibold uppercase">
                        <th className="py-3 px-4">Shift #</th>
                        <th className="py-3 px-4">Date &amp; Time</th>
                        <th className="py-3 px-4 text-center">Belts Active</th>
                        <th className="py-3 px-4 text-right">Duration</th>
                        <th className="py-3 px-4 text-right">Total Bags</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/50 text-sm text-slate-300">
                      {allShifts.map((shift) => (
                        <tr key={shift.id} className="hover:bg-slate-900/20 transition-colors">
                          <td className="py-3 px-4 font-mono text-xs text-slate-500">#{shift.id}</td>
                          <td className="py-3 px-4 font-mono text-xs">{formatDateTime(shift.start_time)}</td>
                          <td className="py-3 px-4 text-center text-slate-300">{shift.belts_active}</td>
                          <td className="py-3 px-4 text-right font-mono text-xs">{formatDuration(shift.duration_secs)}</td>
                          <td className="py-3 px-4 text-right font-black text-emerald-400 text-base">{shift.total_bags.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ════════════════════════════════
             TAB 3 — AUDIT LOG
            ════════════════════════════════ */}
        {activeTab === 'audit' && (
          <div className="bg-slate-900/30 border border-slate-800 rounded-2xl p-6">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <FileText className="h-5 w-5 text-sky-400" /> Completed Audits
              </h2>
              <span className="text-xs text-slate-400 font-mono">Latest {sessions.length} records</span>
            </div>
            {sessions.length === 0 ? (
              <div className="text-center py-12 text-slate-500">
                <Database className="h-10 w-10 mx-auto mb-2 opacity-30" />
                <p>No completed sessions logged in database.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400 text-xs font-semibold uppercase">
                      <th className="py-3 px-4">ID</th>
                      <th className="py-3 px-4">Belt</th>
                      <th className="py-3 px-4">Start Time</th>
                      <th className="py-3 px-4">End Time</th>
                      <th className="py-3 px-4 text-right">Bags</th>
                      <th className="py-3 px-4 text-right">Duration</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/50 text-sm text-slate-300">
                    {sessions.map(s => (
                      <tr key={s.id} className="hover:bg-slate-900/20 transition-colors">
                        <td className="py-3 px-4 font-mono text-xs text-slate-500">#{s.id}</td>
                        <td className="py-3 px-4 font-bold text-white uppercase">{s.belt_id.replace('_', ' ')}</td>
                        <td className="py-3 px-4 font-mono text-xs">{formatTime(s.start_time)}</td>
                        <td className="py-3 px-4 font-mono text-xs">{formatTime(s.end_time)}</td>
                        <td className="py-3 px-4 text-right font-bold text-emerald-400">{s.total_count}</td>
                        <td className="py-3 px-4 text-right font-mono text-xs">{formatDuration(s.end_time - s.start_time)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ════════════════════════════════
             TAB 4 — SYSTEM HEALTH
            ════════════════════════════════ */}
        {activeTab === 'health' && (
          <div className="space-y-6">
            {/* Overview cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { icon: Wifi,        label: 'Online Nodes',    value: onlineCount,                    cls: 'text-emerald-400', bg: 'bg-emerald-500/10' },
                { icon: WifiOff,     label: 'Offline Nodes',   value: offlineCount,                   cls: offlineCount > 0 ? 'text-rose-400' : 'text-slate-400', bg: offlineCount > 0 ? 'bg-rose-500/10' : 'bg-slate-800/30' },
                { icon: Activity,    label: 'Currently Active',value: activeCount,                    cls: 'text-emerald-400', bg: 'bg-emerald-500/10' },
                { icon: Server,      label: 'System Status',   value: offlineCount === 0 ? 'Healthy' : `${offlineCount} down`, cls: offlineCount === 0 ? 'text-emerald-400' : 'text-rose-400', bg: offlineCount === 0 ? 'bg-emerald-500/10' : 'bg-rose-500/10' },
              ].map(({ icon: Icon, label, value, cls, bg }) => (
                <div key={label} className="bg-slate-900/50 border border-slate-800 rounded-xl p-5 flex items-center gap-4">
                  <div className={`p-3 rounded-lg ${bg} ${cls} shrink-0`}><Icon className="h-6 w-6" /></div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{label}</p>
                    <h3 className={`text-2xl font-black mt-0.5 ${cls}`}>{value}</h3>
                  </div>
                </div>
              ))}
            </div>

            {/* Health table (offline-first sort) */}
            <div className="bg-slate-900/30 border border-slate-800 rounded-2xl p-6">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <Server className="h-5 w-5 text-sky-400" /> Edge Node Status
                </h2>
                <span className="text-xs text-slate-500">Offline nodes listed first</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400 text-xs font-semibold uppercase">
                      <th className="py-3 px-4">Belt</th>
                      <th className="py-3 px-4">Connectivity</th>
                      <th className="py-3 px-4">Session</th>
                      <th className="py-3 px-4 text-right">Bags (Live)</th>
                      <th className="py-3 px-4 text-right">Active Time</th>
                      <th className="py-3 px-4 text-right">Last Heartbeat</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/50 text-sm">
                    {sortedBelts.map(belt => (
                      <tr key={belt.belt_id} className={`hover:bg-slate-900/20 transition-colors ${!belt.is_online ? 'bg-rose-950/5' : ''}`}>
                        <td className="py-3 px-4 font-bold text-white uppercase">{belt.belt_id.replace('_', ' ')}</td>
                        <td className="py-3 px-4">
                          <span className={`flex items-center gap-1.5 font-semibold text-xs ${belt.is_online ? 'text-emerald-400' : 'text-rose-400'}`}>
                            <span className={`h-2 w-2 rounded-full shrink-0 ${belt.is_online ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
                            {belt.is_online ? 'ONLINE' : 'OFFLINE'}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <span className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full ${
                            belt.status === 'running' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                            belt.status === 'paused'  ? 'bg-amber-500/10  text-amber-400  border border-amber-500/20'  :
                                                        'bg-slate-800/50  text-slate-500  border border-slate-700'
                          }`}>{belt.status}</span>
                        </td>
                        <td className="py-3 px-4 text-right font-bold text-emerald-400">{belt.live_count}</td>
                        <td className="py-3 px-4 text-right font-mono text-xs text-slate-300">{formatDuration(belt.active_duration)}</td>
                        <td className="py-3 px-4 text-right font-mono text-xs text-slate-400">
                          {belt.last_heartbeat ? timeAgo(belt.last_heartbeat) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

      </main>
    </div>
  );
}
