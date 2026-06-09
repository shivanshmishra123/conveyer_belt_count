from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import redis
import pymysql
from datetime import datetime
import time
import os
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

# --- STARTUP LOGIC ---
@app.on_event("startup")
def startup_event():
    """Automatically builds the MySQL table and upgrades schema precision when the server boots."""
    try:
        conn = get_db_connection()
        with conn.cursor() as cursor:
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS sessions (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    belt_id VARCHAR(50),
                    start_time DOUBLE,
                    end_time DOUBLE,
                    total_count INT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            # Migrate existing tables to double precision to prevent Unix epoch truncation
            cursor.execute("ALTER TABLE sessions MODIFY COLUMN start_time DOUBLE")
            cursor.execute("ALTER TABLE sessions MODIFY COLUMN end_time DOUBLE")
        conn.commit()
        conn.close()
        print("[INFO] MySQL connection successful. 'sessions' table ready.")
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
    
    # Redis Set deduplication
    is_member = r.sismember(f"{belt_id}:counted_bags", bag_id)
    if not is_member:
        r.sadd(f"{belt_id}:counted_bags", bag_id)
        current_count = r.incr(f"{belt_id}:live_count")
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
    
    conn = get_db_connection()
    with conn.cursor() as cursor:
        sql = "INSERT INTO sessions (belt_id, start_time, end_time, total_count) VALUES (%s, %s, %s, %s)"
        cursor.execute(sql, (belt_id, start_time, end_time, live_count))
    conn.commit()
    conn.close()
    
    r.set(f"{belt_id}:status", "idle")
    r.set(f"{belt_id}:live_count", 0)
    r.delete(f"{belt_id}:counted_bags")
    
    print(f"[SUCCESS] Saved session for {belt_id} to MySQL Vault.")
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
    
    # Calculate online status (within 15s window)
    last_hb = r.get(f"{belt_id}:last_heartbeat")
    is_online = False
    if last_hb:
        is_online = (time.time() - float(last_hb)) < 15.0
        
    return {
        "belt_id": belt_id,
        "status": status,
        "live_count": live_count,
        "active_duration": max(0.0, elapsed_time),
        "is_online": is_online
    }
# --- DASHBOARD ENDPOINTS (VERIFICATION) ---

@app.get("/api/v1/live_count/{belt_id}")
def get_live_count(belt_id: str):
    """Fetches the current live count from Redis."""
    count = r.get(f"{belt_id}:live_count")
    # If the key doesn't exist yet, return 0
    return {"belt_id": belt_id, "live_count": int(count) if count else 0}

@app.get("/api/v1/sessions")
def get_all_sessions():
    """Fetches all completed load sessions from the MySQL Vault."""
    conn = get_db_connection()
    with conn.cursor() as cursor:
        # Grab the latest 50 sessions, newest first
        cursor.execute("SELECT * FROM sessions ORDER BY created_at DESC LIMIT 50")
        results = cursor.fetchall()
    conn.close()
    
    return {"total_sessions_saved": len(results), "sessions": results}

@app.get("/api/v1/analytics/summary")
def get_analytics_summary():
    """
    Aggregates all completed session data from MySQL into shift-level analytics.
    Returns global totals and a per-belt breakdown sorted by total bags loaded.
    """
    conn = get_db_connection()
    with conn.cursor() as cursor:
        cursor.execute("""
            SELECT
                belt_id,
                COUNT(*) AS session_count,
                SUM(total_count) AS total_bags,
                AVG(end_time - start_time) AS avg_duration_secs
            FROM sessions
            GROUP BY belt_id
            ORDER BY total_bags DESC
        """)
        per_belt = cursor.fetchall()
    conn.close()

    if not per_belt:
        return {
            "total_sessions": 0,
            "total_bags_loaded": 0,
            "avg_bags_per_session": 0.0,
            "avg_session_duration_secs": 0.0,
            "busiest_belt": None,
            "per_belt": []
        }

    total_sessions = sum(row["session_count"] for row in per_belt)
    total_bags = sum(row["total_bags"] for row in per_belt)
    avg_bags = round(total_bags / total_sessions, 1) if total_sessions > 0 else 0.0
    avg_duration = round(
        sum(row["avg_duration_secs"] * row["session_count"] for row in per_belt) / total_sessions, 1
    ) if total_sessions > 0 else 0.0

    # Sanitize float values from Decimal returned by MySQL
    sanitized_per_belt = [
        {
            "belt_id": row["belt_id"],
            "session_count": int(row["session_count"]),
            "total_bags": int(row["total_bags"]),
            "avg_duration_secs": round(float(row["avg_duration_secs"]), 1)
        }
        for row in per_belt
    ]

    return {
        "total_sessions": total_sessions,
        "total_bags_loaded": int(total_bags),
        "avg_bags_per_session": avg_bags,
        "avg_session_duration_secs": avg_duration,
        "busiest_belt": sanitized_per_belt[0]["belt_id"] if sanitized_per_belt else None,
        "per_belt": sanitized_per_belt
    }