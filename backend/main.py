from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import redis
import pymysql
from datetime import datetime
import time
import os
import json
from dotenv import load_dotenv

# Load environment variables from .env file (no-op if file not found)
load_dotenv()

app = FastAPI(title="Cement Dispatch API")

# Parse CORS origins from env — split comma-separated list, fallback to allow-all
_cors_env = os.getenv("CORS_ORIGINS", "*")
CORS_ORIGINS = [o.strip() for o in _cors_env.split(",")] if _cors_env != "*" else ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- DATABASE CONNECTIONS ---
# Redis (The Fast Cache)
r = redis.Redis(
    host=os.getenv("REDIS_HOST", "127.0.0.1"),
    port=int(os.getenv("REDIS_PORT", 6379)),
    decode_responses=True
)

# MySQL (The Permanent Vault)
def get_db_connection():
    return pymysql.connect(
        host=os.getenv("DB_HOST", "127.0.0.1"),
        port=int(os.getenv("DB_PORT", 3306)),
        user=os.getenv("DB_USER", "api_user"),
        password=os.getenv("DB_PASSWORD", "apipassword"),
        database=os.getenv("DB_NAME", "cement_dispatch"),
        cursorclass=pymysql.cursors.DictCursor
    )

# All 25 belt IDs — used for shift lifecycle checks
ALL_BELTS = [f"belt_{str(i + 1).zfill(2)}" for i in range(25)]

# --- STARTUP LOGIC ---
@app.on_event("startup")
def startup_event():
    """Automatically builds MySQL tables and upgrades schema precision on server boot."""
    try:
        conn = get_db_connection()
        with conn.cursor() as cursor:
            # Per-belt sessions table (one row per Start → Stop cycle)
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS sessions (
                    id         INT AUTO_INCREMENT PRIMARY KEY,
                    belt_id    VARCHAR(50),
                    start_time DOUBLE,
                    end_time   DOUBLE,
                    total_count INT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            # Migrate existing tables to double precision to prevent Unix epoch truncation
            cursor.execute("ALTER TABLE sessions MODIFY COLUMN start_time DOUBLE")
            cursor.execute("ALTER TABLE sessions MODIFY COLUMN end_time DOUBLE")

            # Shift summary table — one row per completed shift (all belts idle)
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS shifts (
                    id           INT AUTO_INCREMENT PRIMARY KEY,
                    start_time   DOUBLE,
                    end_time     DOUBLE,
                    total_bags   INT,
                    belt_summary JSON,
                    created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
        conn.commit()
        conn.close()
        print("[INFO] MySQL connection successful. 'sessions' and 'shifts' tables ready.")
    except Exception as e:
        print(f"[ERROR] Could not connect to MySQL: {e}")


# --- PYDANTIC SCHEMAS ---
class CountPayload(BaseModel):
    belt_id: str
    bag_id: str
    timestamp: float

class SessionControlPayload(BaseModel):
    belt_id: str

class HeartbeatPayload(BaseModel):
    belt_id: str
    timestamp: float


# --- API ENDPOINTS ---

@app.post("/api/v1/count_increment")
def update_live_count(payload: CountPayload):
    belt_id = payload.belt_id
    bag_id = payload.bag_id

    status = r.get(f"{belt_id}:status") or "idle"
    if status != "running":
        return {
            "status": "ignored",
            "message": f"Count increment ignored. Belt session is currently {status}.",
            "redis_live_count": int(r.get(f"{belt_id}:live_count") or 0)
        }

    # Redis Set deduplication — ignore bags already counted this session
    is_member = r.sismember(f"{belt_id}:counted_bags", bag_id)
    if not is_member:
        r.sadd(f"{belt_id}:counted_bags", bag_id)
        current_count = r.incr(f"{belt_id}:live_count")
        # Accumulate into the current shift's per-belt running total
        r.incr(f"shift:{belt_id}:count")
        r.set(f"{belt_id}:last_updated", payload.timestamp)
        return {"status": "success", "redis_live_count": current_count}
    else:
        current_count = int(r.get(f"{belt_id}:live_count") or 0)
        return {"status": "duplicate_ignored", "redis_live_count": current_count}


@app.post("/api/v1/heartbeat")
def record_heartbeat(payload: HeartbeatPayload):
    belt_id = payload.belt_id
    r.set(f"{belt_id}:last_heartbeat", payload.timestamp)
    return {"status": "success", "message": f"Heartbeat received for {belt_id}"}


@app.post("/api/v1/session/start")
def start_session(payload: SessionControlPayload):
    belt_id = payload.belt_id
    status = r.get(f"{belt_id}:status") or "idle"
    if status != "idle":
        return {"status": "error", "message": f"Session is already {status}"}

    current_time = time.time()
    r.set(f"{belt_id}:status", "running")
    r.set(f"{belt_id}:live_count", 0)
    r.set(f"{belt_id}:start_time", current_time)
    r.set(f"{belt_id}:total_paused_time", 0.0)
    r.delete(f"{belt_id}:counted_bags")

    # Shift lifecycle: open a new shift if none is currently active
    if not r.get("shift:active"):
        r.set("shift:active", "1")
        r.set("shift:start_time", current_time)
        print(f"[SHIFT STARTED] New shift opened at {current_time:.0f}")

    return {"status": "success", "message": f"Session started for {belt_id}"}


@app.post("/api/v1/session/pause")
def pause_session(payload: SessionControlPayload):
    belt_id = payload.belt_id
    status = r.get(f"{belt_id}:status") or "idle"
    if status != "running":
        return {"status": "error", "message": f"Cannot pause session when status is {status}"}

    current_time = time.time()
    r.set(f"{belt_id}:status", "paused")
    r.set(f"{belt_id}:last_pause_time", current_time)

    return {"status": "success", "message": f"Session paused for {belt_id}"}


@app.post("/api/v1/session/resume")
def resume_session(payload: SessionControlPayload):
    belt_id = payload.belt_id
    status = r.get(f"{belt_id}:status") or "idle"
    if status != "paused":
        return {"status": "error", "message": f"Cannot resume session when status is {status}"}

    current_time = time.time()
    last_pause_time = float(r.get(f"{belt_id}:last_pause_time") or current_time)
    paused_duration = current_time - last_pause_time
    r.set(f"{belt_id}:status", "running")
    r.incrbyfloat(f"{belt_id}:total_paused_time", paused_duration)

    return {"status": "success", "message": f"Session resumed for {belt_id}"}


@app.post("/api/v1/session/complete")
def complete_session(payload: SessionControlPayload):
    belt_id = payload.belt_id
    status = r.get(f"{belt_id}:status") or "idle"
    if status == "idle":
        return {"status": "error", "message": "No active session to complete"}

    current_time = time.time()
    start_time = float(r.get(f"{belt_id}:start_time") or current_time)
    total_paused_time = float(r.get(f"{belt_id}:total_paused_time") or 0.0)

    if status == "paused":
        last_pause_time = float(r.get(f"{belt_id}:last_pause_time") or current_time)
        paused_duration = current_time - last_pause_time
        total_paused_time += paused_duration

    live_count = int(r.get(f"{belt_id}:live_count") or 0)
    active_duration = max(0.0, current_time - start_time - total_paused_time)
    end_time = start_time + active_duration

    # Write this belt's session to MySQL
    conn = get_db_connection()
    with conn.cursor() as cursor:
        cursor.execute(
            "INSERT INTO sessions (belt_id, start_time, end_time, total_count) VALUES (%s, %s, %s, %s)",
            (belt_id, start_time, end_time, live_count)
        )
    conn.commit()
    conn.close()

    # Clear this belt's live session state in Redis
    r.set(f"{belt_id}:status", "idle")
    r.set(f"{belt_id}:live_count", 0)
    r.delete(f"{belt_id}:counted_bags")

    print(f"[SUCCESS] Saved session for {belt_id} to MySQL. Bags: {live_count}")

    # --- SHIFT LIFECYCLE: check if ALL 25 belts are now idle ---
    all_idle = all((r.get(f"{b}:status") or "idle") == "idle" for b in ALL_BELTS)

    if all_idle and r.get("shift:active"):
        shift_end = time.time()
        shift_start = float(r.get("shift:start_time") or shift_end)

        # Collect per-belt bag counts accumulated throughout the shift
        belt_summary = {}
        shift_total = 0
        for b in ALL_BELTS:
            count = int(r.get(f"shift:{b}:count") or 0)
            if count > 0:
                belt_summary[b] = count
                shift_total += count

        # Write shift summary to MySQL
        shift_conn = get_db_connection()
        with shift_conn.cursor() as shift_cursor:
            shift_cursor.execute(
                "INSERT INTO shifts (start_time, end_time, total_bags, belt_summary) VALUES (%s, %s, %s, %s)",
                (shift_start, shift_end, shift_total, json.dumps(belt_summary))
            )
        shift_conn.commit()
        shift_conn.close()

        # Clean up all shift Redis keys
        r.delete("shift:active", "shift:start_time")
        for b in ALL_BELTS:
            r.delete(f"shift:{b}:count")

        print(f"[SHIFT COMPLETE] All belts idle. Shift recorded. Total bags: {shift_total}")

    return {
        "status": "success",
        "message": f"Session completed for {belt_id}",
        "total_count": live_count,
        "active_duration": active_duration
    }


@app.get("/api/v1/session/status/{belt_id}")
def get_session_status(belt_id: str):
    status = r.get(f"{belt_id}:status") or "idle"
    live_count = int(r.get(f"{belt_id}:live_count") or 0)
    start_time = r.get(f"{belt_id}:start_time")
    total_paused_time = float(r.get(f"{belt_id}:total_paused_time") or 0.0)

    elapsed_time = 0.0
    if status == "running" and start_time:
        elapsed_time = time.time() - float(start_time) - total_paused_time
    elif status == "paused" and start_time:
        last_pause_time = float(r.get(f"{belt_id}:last_pause_time") or time.time())
        elapsed_time = last_pause_time - float(start_time) - total_paused_time

    # Calculate online status (within 15s heartbeat window)
    last_hb = r.get(f"{belt_id}:last_heartbeat")
    is_online = False
    if last_hb:
        is_online = (time.time() - float(last_hb)) < 15.0

    return {
        "belt_id": belt_id,
        "status": status,
        "live_count": live_count,
        "active_duration": max(0.0, elapsed_time),
        "is_online": is_online,
        "last_heartbeat": float(last_hb) if last_hb else None
    }


# --- DASHBOARD ENDPOINTS ---

@app.get("/api/v1/live_count/{belt_id}")
def get_live_count(belt_id: str):
    """Fetches the current live count from Redis."""
    count = r.get(f"{belt_id}:live_count")
    return {"belt_id": belt_id, "live_count": int(count) if count else 0}


@app.get("/api/v1/sessions")
def get_all_sessions():
    """Fetches all completed load sessions from the MySQL Vault."""
    conn = get_db_connection()
    with conn.cursor() as cursor:
        cursor.execute("SELECT * FROM sessions ORDER BY created_at DESC LIMIT 50")
        results = cursor.fetchall()
    conn.close()
    return {"total_sessions_saved": len(results), "sessions": results}


@app.get("/api/v1/shifts")
def get_all_shifts():
    """
    Returns all completed shift records from MySQL, newest first.
    Used by the Shift History table in the dashboard.
    """
    conn = get_db_connection()
    with conn.cursor() as cursor:
        cursor.execute("SELECT * FROM shifts ORDER BY created_at DESC LIMIT 30")
        rows = cursor.fetchall()
    conn.close()

    result = []
    for row in rows:
        belt_summary = row["belt_summary"]
        if isinstance(belt_summary, str):
            belt_summary = json.loads(belt_summary)
        result.append({
            "id": row["id"],
            "start_time": row["start_time"],
            "end_time": row["end_time"],
            "duration_secs": round(row["end_time"] - row["start_time"], 1),
            "total_bags": row["total_bags"],
            "belts_active": len(belt_summary) if belt_summary else 0,
            "belt_summary": belt_summary,
            "created_at": str(row["created_at"])
        })
    return {"shifts": result, "total": len(result)}


@app.get("/api/v1/shift/current")
def get_current_shift():
    """
    Returns the live state of the currently active shift.
    A shift is active from when the first belt starts until all 25 belts are idle.
    Returns per-belt bag counts accumulated since the shift opened.
    """
    shift_active = r.get("shift:active")

    if not shift_active:
        return {
            "shift_status": "idle",
            "shift_start_time": None,
            "belts_active": 0,
            "total_bags_so_far": 0,
            "per_belt": {}
        }

    shift_start = float(r.get("shift:start_time") or time.time())
    per_belt = {}
    total = 0
    belts_active = 0

    for b in ALL_BELTS:
        count = int(r.get(f"shift:{b}:count") or 0)
        status = r.get(f"{b}:status") or "idle"
        if count > 0:
            per_belt[b] = count
            total += count
        if status in ("running", "paused"):
            belts_active += 1

    return {
        "shift_status": "active",
        "shift_start_time": shift_start,
        "belts_active": belts_active,
        "total_bags_so_far": total,
        "per_belt": per_belt
    }


@app.get("/api/v1/shift/last")
def get_last_shift():
    """
    Returns the most recently completed shift record from MySQL.
    Called by the frontend when all belts go idle to display the final shift summary.
    """
    conn = get_db_connection()
    with conn.cursor() as cursor:
        cursor.execute("SELECT * FROM shifts ORDER BY created_at DESC LIMIT 1")
        row = cursor.fetchone()
    conn.close()

    if not row:
        return {"shift": None}

    # MySQL JSON column may return a string or dict depending on driver version
    belt_summary = row["belt_summary"]
    if isinstance(belt_summary, str):
        belt_summary = json.loads(belt_summary)

    return {
        "shift": {
            "id": row["id"],
            "start_time": row["start_time"],
            "end_time": row["end_time"],
            "duration_secs": round(row["end_time"] - row["start_time"], 1),
            "total_bags": row["total_bags"],
            "belt_summary": belt_summary
        }
    }