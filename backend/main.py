from fastapi import FastAPI
from pydantic import BaseModel
import redis
import pymysql
from datetime import datetime
import time

app = FastAPI(title="Cement Dispatch API")

# --- DATABASE CONNECTIONS ---
# Redis (The Fast Cache)
r = redis.Redis(host='127.0.0.1', port=6379, decode_responses=True)

# MySQL (The Permanent Vault)
def get_db_connection():
    return pymysql.connect(
        host='127.0.0.1',
        user='api_user',
        password='apipassword',
        database='cement_dispatch',
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
    
    return {
        "belt_id": belt_id,
        "status": status,
        "live_count": live_count,
        "active_duration": max(0.0, elapsed_time)
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