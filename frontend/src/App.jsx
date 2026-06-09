import React, { useState, useEffect } from 'react';
import { 
  Play, 
  Pause, 
  CheckCircle, 
  Activity, 
  Clock, 
  Database, 
  AlertTriangle,
  FileText,
  Truck,
  BarChart2,
  TrendingUp,
  Timer,
  Award
} from 'lucide-react';

const BACKEND_URL = "http://127.0.0.1:8000";

function App() {
  const [beltStatuses, setBeltStatuses] = useState({});
  const [sessions, setSessions] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");

  // Helper: Format seconds to MM:SS
  const formatDuration = (seconds) => {
    if (seconds === undefined || seconds === null) return "00:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  // Helper: Format unix epoch to locale date string
  const formatTimestamp = (timestamp) => {
    if (!timestamp) return "N/A";
    const date = new Date(timestamp * 1000);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  // Fetch real-time statuses for all 25 belts in parallel (Called every 5 seconds)
  const fetchAllStatuses = async () => {
    try {
      const promises = Array.from({ length: 25 }, (_, i) => {
        const beltId = `belt_${String(i + 1).padStart(2, '0')}`;
        return fetch(`${BACKEND_URL}/api/v1/session/status/${beltId}`)
          .then(res => {
            if (!res.ok) throw new Error();
            return res.json();
          })
          .catch(() => ({
            belt_id: beltId,
            status: "idle",
            live_count: 0,
            active_duration: 0.0,
            is_online: false
          }));
      });
      const results = await Promise.all(promises);
      const newStatuses = {};
      results.forEach(res => {
        newStatuses[res.belt_id] = res;
      });
      setBeltStatuses(newStatuses);
      setErrorMessage("");
    } catch (err) {
      setErrorMessage("Could not connect to FastAPI Backend. Check database/API services.");
    }
  };

  // Fetch completed sessions from database (Called every 5 seconds)
  const fetchCompletedSessions = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/v1/sessions`);
      if (res.ok) {
        const data = await res.json();
        setSessions(data.sessions || []);
      }
    } catch (err) {
      console.error("Error fetching completed sessions:", err);
    }
  };

  // Fetch aggregated shift analytics (Called every 30 seconds — data changes slowly)
  const fetchAnalytics = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/v1/analytics/summary`);
      if (res.ok) {
        const data = await res.json();
        setAnalytics(data);
      }
    } catch (err) {
      console.error("Error fetching analytics:", err);
    }
  };

  // Initial load and slow status polling (5-second intervals to minimize backend load)
  useEffect(() => {
    fetchAllStatuses();
    fetchCompletedSessions();
    fetchAnalytics();

    const statusInterval = setInterval(fetchAllStatuses, 5000);
    const sessionInterval = setInterval(fetchCompletedSessions, 5000);
    const analyticsInterval = setInterval(fetchAnalytics, 30000);

    return () => {
      clearInterval(statusInterval);
      clearInterval(sessionInterval);
      clearInterval(analyticsInterval);
    };
  }, []);

  // Smooth local timer logic: ticks active durations on the client side every 1.0s
  // This avoids hammering the backend for real-time timer increments.
  useEffect(() => {
    const localTimer = setInterval(() => {
      setBeltStatuses(prev => {
        const updated = { ...prev };
        let changed = false;
        Object.keys(updated).forEach(id => {
          if (updated[id].status === "running") {
            updated[id] = {
              ...updated[id],
              active_duration: updated[id].active_duration + 1
            };
            changed = true;
          }
        });
        return changed ? updated : prev;
      });
    }, 1000);

    return () => clearInterval(localTimer);
  }, []);

  // Handle Session Control Actions
  const handleSessionControl = async (beltId, action) => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/v1/session/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ belt_id: beltId })
      });
      if (res.ok) {
        // Trigger immediate sync of status & database lists
        fetchAllStatuses();
        fetchCompletedSessions();
      } else {
        const data = await res.json();
        alert(`Action failed: ${data.detail || data.message || "Unknown error"}`);
      }
    } catch (err) {
      alert("Network error. Could not connect to API server.");
    }
  };

  // Calculate high-level summary counters
  const activeCount = Object.values(beltStatuses).filter(b => b.status === "running").length;
  const pausedCount = Object.values(beltStatuses).filter(b => b.status === "paused").length;
  const totalBagsLoadedToday = sessions.reduce((sum, s) => sum + s.total_count, 0);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans p-6">
      <header className="max-w-7xl mx-auto mb-8">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between border-b border-slate-800 pb-6">
          <div>
            <div className="flex items-center gap-3">
              <Truck className="h-8 w-8 text-sky-500" />
              <h1 className="text-3xl font-extrabold tracking-tight text-white">Cement Dispatch</h1>
            </div>
            <p className="text-slate-400 mt-1">Conveyor belt monitoring & loading audits</p>
          </div>
          
          {errorMessage && (
            <div className="mt-4 md:mt-0 flex items-center gap-2 bg-rose-950/50 border border-rose-900 text-rose-300 px-4 py-2.5 rounded-lg text-sm">
              <AlertTriangle className="h-4 w-4 shrink-0 text-rose-400" />
              <span>{errorMessage}</span>
            </div>
          )}
        </div>

        {/* --- SUMMARY BOXES --- */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-6">
          <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-5 flex items-center gap-4">
            <div className="p-3 rounded-lg bg-emerald-500/10 text-emerald-400">
              <Activity className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Running Belts</p>
              <h3 className="text-2xl font-black text-emerald-400 mt-0.5">{activeCount} / 25</h3>
            </div>
          </div>

          <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-5 flex items-center gap-4">
            <div className="p-3 rounded-lg bg-amber-500/10 text-amber-400">
              <Pause className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Paused Belts</p>
              <h3 className="text-2xl font-black text-amber-400 mt-0.5">{pausedCount} / 25</h3>
            </div>
          </div>

          <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-5 flex items-center gap-4">
            <div className="p-3 rounded-lg bg-sky-500/10 text-sky-400">
              <CheckCircle className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Completed Sessions</p>
              <h3 className="text-2xl font-black text-sky-400 mt-0.5">{sessions.length}</h3>
            </div>
          </div>

          <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-5 flex items-center gap-4">
            <div className="p-3 rounded-lg bg-purple-500/10 text-purple-400">
              <Database className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Bags Loaded (Shift)</p>
              <h3 className="text-2xl font-black text-purple-400 mt-0.5">{totalBagsLoadedToday}</h3>
            </div>
          </div>
        </div>
      </header>

      {/* --- 25 CONVEYOR BELT GRID --- */}
      <main className="max-w-7xl mx-auto space-y-10">
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Activity className="h-5 w-5 text-sky-400" />
            <h2 className="text-xl font-bold text-white">Live Conveyor Belts</h2>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {Array.from({ length: 25 }, (_, i) => {
              const beltId = `belt_${String(i + 1).padStart(2, '0')}`;
              const belt = beltStatuses[beltId] || {
                status: "idle",
                live_count: 0,
                active_duration: 0.0,
                is_online: false
              };

              // Status Styling Colors
              let statusBg = "bg-slate-900/80 border-slate-800";
              let statusBadge = "bg-slate-850 text-slate-400 border border-slate-800/40";
              
              if (belt.status === "running") {
                statusBg = "bg-emerald-950/20 border-emerald-800/60 shadow-lg shadow-emerald-950/20";
                statusBadge = "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20";
              } else if (belt.status === "paused") {
                statusBg = "bg-amber-950/20 border-amber-800/60 shadow-lg shadow-amber-950/20";
                statusBadge = "bg-amber-500/10 text-amber-400 border border-amber-500/20";
              }

              return (
                <div key={beltId} className={`rounded-xl border p-4 flex flex-col justify-between transition-all duration-300 hover:scale-[1.02] ${statusBg}`}>
                  <div>
                    {/* Header: ID and Status */}
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-1.5">
                        <span className={`h-2.5 w-2.5 rounded-full ${belt.is_online ? "bg-emerald-500 animate-pulse" : "bg-rose-500"}`}></span>
                        <span className="font-bold text-sm text-slate-300 uppercase">{beltId.replace("_", " ")}</span>
                      </div>
                      <span className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full ${statusBadge}`}>
                        {belt.is_online ? belt.status : "offline"}
                      </span>
                    </div>

                    {/* Stats Section (Duration only) */}
                    <div className="space-y-2 py-2">
                      <div className="flex justify-between items-center border-b border-slate-800/40 pb-2">
                        <span className="text-xs text-slate-400 flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5" /> Active Time
                        </span>
                        <span className="text-sm font-semibold font-mono text-slate-200">
                          {formatDuration(belt.active_duration)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Actions Section */}
                  <div className="mt-4 pt-3 border-t border-slate-800/60 flex flex-col gap-2">
                    {/* Offline warning strip — does NOT block controls */}
                    {!belt.is_online && (
                      <div className="flex items-center gap-1.5 text-[10px] text-rose-400/80 bg-rose-950/20 border border-rose-900/30 rounded-md px-2 py-1">
                        <AlertTriangle className="h-3 w-3 shrink-0" />
                        <span>Edge node offline — counting inactive</span>
                      </div>
                    )}
                    <div className="flex gap-2">
                    {belt.status === "idle" ? (
                      <button 
                        onClick={() => handleSessionControl(beltId, "start")}
                        className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-1.5 rounded-lg text-xs flex items-center justify-center gap-1 transition-colors"
                      >
                        <Play className="h-3.5 w-3.5 fill-current" /> Start
                      </button>
                    ) : (
                      <>
                        {belt.status === "running" ? (
                          <button 
                            onClick={() => handleSessionControl(beltId, "pause")}
                            className="flex-1 bg-amber-600 hover:bg-amber-500 text-white font-bold py-1.5 rounded-lg text-xs flex items-center justify-center gap-1 transition-colors"
                          >
                            <Pause className="h-3.5 w-3.5 fill-current" /> Pause
                          </button>
                        ) : (
                          <button 
                            onClick={() => handleSessionControl(beltId, "resume")}
                            className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-1.5 rounded-lg text-xs flex items-center justify-center gap-1 transition-colors"
                          >
                            <Play className="h-3.5 w-3.5 fill-current" /> Resume
                          </button>
                        )}
                        <button 
                          onClick={() => handleSessionControl(beltId, "complete")}
                          className="flex-1 bg-rose-600 hover:bg-rose-500 text-white font-bold py-1.5 rounded-lg text-xs flex items-center justify-center gap-1 transition-colors"
                        >
                          <CheckCircle className="h-3.5 w-3.5" /> Stop
                        </button>
                      </>
                    )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* --- SHIFT ANALYTICS --- */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <BarChart2 className="h-5 w-5 text-sky-400" />
            <h2 className="text-xl font-bold text-white">Shift Analytics</h2>
            <span className="text-xs text-slate-500 ml-1">(refreshes every 30s)</span>
          </div>

          {!analytics || analytics.total_sessions === 0 ? (
            <div className="bg-slate-900/30 border border-slate-800 rounded-2xl p-10 text-center text-slate-500">
              <BarChart2 className="h-10 w-10 mx-auto mb-2 opacity-30" />
              <p>No completed sessions yet. Analytics will appear after the first session is completed.</p>
            </div>
          ) : (
            <>
              {/* --- 4 Metric Cards --- */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-5 flex items-center gap-4">
                  <div className="p-3 rounded-lg bg-emerald-500/10 text-emerald-400 shrink-0">
                    <TrendingUp className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Total Bags Loaded</p>
                    <h3 className="text-2xl font-black text-emerald-400 mt-0.5">{analytics.total_bags_loaded.toLocaleString()}</h3>
                  </div>
                </div>

                <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-5 flex items-center gap-4">
                  <div className="p-3 rounded-lg bg-sky-500/10 text-sky-400 shrink-0">
                    <CheckCircle className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Total Sessions</p>
                    <h3 className="text-2xl font-black text-sky-400 mt-0.5">{analytics.total_sessions}</h3>
                  </div>
                </div>

                <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-5 flex items-center gap-4">
                  <div className="p-3 rounded-lg bg-purple-500/10 text-purple-400 shrink-0">
                    <Database className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Avg Bags / Session</p>
                    <h3 className="text-2xl font-black text-purple-400 mt-0.5">{analytics.avg_bags_per_session}</h3>
                  </div>
                </div>

                <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-5 flex items-center gap-4">
                  <div className="p-3 rounded-lg bg-amber-500/10 text-amber-400 shrink-0">
                    <Timer className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Avg Load Duration</p>
                    <h3 className="text-2xl font-black text-amber-400 mt-0.5">{formatDuration(analytics.avg_session_duration_secs)}</h3>
                  </div>
                </div>
              </div>

              {/* --- Per-Belt Breakdown Table --- */}
              <div className="bg-slate-900/30 border border-slate-800 rounded-2xl p-6">
                <div className="flex items-center gap-2 mb-4 border-b border-slate-800 pb-3 justify-between">
                  <div className="flex items-center gap-2">
                    <Award className="h-5 w-5 text-amber-400" />
                    <h3 className="text-lg font-bold text-white">Belt Leaderboard</h3>
                    {analytics.busiest_belt && (
                      <span className="text-xs bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded-full font-semibold uppercase">
                        🏆 {analytics.busiest_belt.replace("_", " ")} leading
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-slate-400 font-mono">{analytics.per_belt.length} active belts</span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-800 text-slate-400 text-xs font-semibold uppercase">
                        <th className="py-3 px-4">Rank</th>
                        <th className="py-3 px-4">Belt ID</th>
                        <th className="py-3 px-4 text-center">Sessions</th>
                        <th className="py-3 px-4 text-right">Total Bags</th>
                        <th className="py-3 px-4 text-right">Avg Duration</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/50 text-sm text-slate-300">
                      {analytics.per_belt.map((belt, idx) => (
                        <tr key={belt.belt_id} className={`hover:bg-slate-900/20 transition-colors ${idx === 0 ? 'bg-amber-950/10' : ''}`}>
                          <td className="py-3 px-4 font-mono text-xs">
                            {idx === 0 ? (
                              <span className="text-amber-400 font-bold">🥇 1</span>
                            ) : idx === 1 ? (
                              <span className="text-slate-300 font-bold">🥈 2</span>
                            ) : idx === 2 ? (
                              <span className="text-amber-700 font-bold">🥉 3</span>
                            ) : (
                              <span className="text-slate-500">#{idx + 1}</span>
                            )}
                          </td>
                          <td className="py-3 px-4 font-bold text-white uppercase">{belt.belt_id.replace("_", " ")}</td>
                          <td className="py-3 px-4 text-center text-slate-300">{belt.session_count}</td>
                          <td className="py-3 px-4 text-right font-bold text-emerald-400">{belt.total_bags.toLocaleString()}</td>
                          <td className="py-3 px-4 text-right font-mono text-xs">{formatDuration(belt.avg_duration_secs)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </section>

        {/* --- AUDIT LOGS TABLE --- */}
        <section className="bg-slate-900/30 border border-slate-800 rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-4 border-b border-slate-800 pb-3 justify-between">
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-sky-400" />
              <h2 className="text-xl font-bold text-white">Completed Audits</h2>
            </div>
            <span className="text-xs text-slate-400 font-mono">Latest 50 records</span>
          </div>

          <div className="overflow-x-auto">
            {sessions.length === 0 ? (
              <div className="text-center py-10 text-slate-500">
                <Database className="h-10 w-10 mx-auto mb-2 opacity-40" />
                <p>No completed sessions logged in database.</p>
              </div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 text-xs font-semibold uppercase">
                    <th className="py-3 px-4">Session ID</th>
                    <th className="py-3 px-4">Belt ID</th>
                    <th className="py-3 px-4">Start Time</th>
                    <th className="py-3 px-4">End Time</th>
                    <th className="py-3 px-4 text-right">Bags Loaded</th>
                    <th className="py-3 px-4 text-right">Loading Duration</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50 text-sm text-slate-300">
                  {sessions.map((session) => {
                    const sessionDuration = session.end_time - session.start_time;
                    return (
                      <tr key={session.id} className="hover:bg-slate-900/20 transition-colors">
                        <td className="py-3 px-4 font-mono text-xs text-slate-500">#{session.id}</td>
                        <td className="py-3 px-4 font-bold text-white uppercase">{session.belt_id.replace("_", " ")}</td>
                        <td className="py-3 px-4 font-mono text-xs">{formatTimestamp(session.start_time)}</td>
                        <td className="py-3 px-4 font-mono text-xs">{formatTimestamp(session.end_time)}</td>
                        <td className="py-3 px-4 text-right font-bold text-emerald-400">{session.total_count}</td>
                        <td className="py-3 px-4 text-right font-mono text-xs">{formatDuration(sessionDuration)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;
