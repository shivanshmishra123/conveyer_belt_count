import React, { useState, useEffect } from 'react';

import TopNav from './components/TopNav';
import SideNav from './components/SideNav';
import LiveMonitor from './components/LiveMonitor';
import ShiftSummary from './components/ShiftSummary';
import AuditLog from './components/AuditLog';
import SystemHealth from './components/SystemHealth';

const BACKEND_URL = 'http://127.0.0.1:8000';

export default function App() {
  // ── State ──────────────────────────────────────────────────────────────
  const [activeTab,     setActiveTab]     = useState('live');
  const [beltStatuses,  setBeltStatuses]  = useState({});
  const [sessions,      setSessions]      = useState([]);
  const [shiftData,     setShiftData]     = useState(null);
  const [lastShift,     setLastShift]     = useState(null);
  const [allShifts,     setAllShifts]     = useState([]);
  const [selectedShift, setSelectedShift] = useState(null); // shift detail drill-down
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
      const r = await fetch(`${BACKEND_URL}/api/v1/sessions/current-shift`);
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

  const fetchShiftDetail = async (id) => {
    try {
      const r = await fetch(`${BACKEND_URL}/api/v1/shifts/${id}`);
      if (r.ok) setSelectedShift(await r.json());
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
    <div className="font-body-md text-body-md overflow-x-hidden bg-background text-on-background min-h-screen">
      <TopNav 
        activeCount={activeCount} 
        pausedCount={pausedCount} 
        onlineCount={onlineCount} 
        offlineCount={offlineCount} 
        errorMessage={errorMessage} 
      />
      <SideNav activeTab={activeTab} setActiveTab={setActiveTab} />
      
      <main className="md:ml-64 pt-24 px-gutter pb-xl min-h-screen flex flex-col">
        {/* Mobile Navigation fallback (if needed, but SideNav uses hidden md:flex) */}
        <div className="md:hidden flex overflow-x-auto gap-sm mb-md pb-xs border-b border-outline-variant">
          {[
            { id: 'live', label: 'Live Monitor', icon: 'monitoring' },
            { id: 'shift', label: 'Shift Summary', icon: 'assignment' },
            { id: 'audit', label: 'Audit Log', icon: 'history_edu' },
            { id: 'health', label: 'System Health', icon: 'health_and_safety' }
          ].map(item => (
            <button 
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`flex items-center gap-xs px-sm py-xs whitespace-nowrap rounded-lg ${activeTab === item.id ? 'bg-secondary text-on-secondary' : 'bg-surface-container text-on-surface-variant'}`}
            >
              <span className="material-symbols-outlined text-[16px]">{item.icon}</span>
              <span className="font-label-md text-label-md">{item.label}</span>
            </button>
          ))}
        </div>

        <div className="max-w-[1400px] w-full mx-auto space-y-lg flex-1">
          {activeTab === 'live' && (
            <LiveMonitor 
              beltStatuses={beltStatuses}
              activeCount={activeCount}
              pausedCount={pausedCount}
              sessions={sessions}
              shiftData={shiftData}
              lastShift={lastShift}
              handleControl={handleControl}
              formatDuration={formatDuration}
            />
          )}
          
          {activeTab === 'shift' && (
            <ShiftSummary 
              shiftData={shiftData}
              lastShift={lastShift}
              allShifts={allShifts}
              selectedShift={selectedShift}
              setSelectedShift={setSelectedShift}
              fetchShiftDetail={fetchShiftDetail}
              formatDuration={formatDuration}
              formatDateTime={formatDateTime}
              formatTime={formatTime}
            />
          )}
          
          {activeTab === 'audit' && (
            <AuditLog 
              sessions={sessions}
              formatTime={formatTime}
              formatDuration={formatDuration}
            />
          )}
          
          {activeTab === 'health' && (
            <SystemHealth 
              onlineCount={onlineCount}
              offlineCount={offlineCount}
              activeCount={activeCount}
              sortedBelts={sortedBelts}
              formatDuration={formatDuration}
              timeAgo={timeAgo}
            />
          )}
        </div>
      </main>
    </div>
  );
}
