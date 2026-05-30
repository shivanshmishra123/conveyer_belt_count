from fastapi import FastAPI
from pydantic import BaseModel
import redis
import pymysql
from datetime import datetime

app = FastAPI(title="Cement Dispatch API")

# --- DATABASE CONNECTIONS ---
# Redis (The Fast Cache)
r = redis.Redis(host='localhost', port=6379, decode_responses=True)

# MySQL (The Permanent Vault)
def get_db_connection():
    return pymysql.connect(
        host='localhost',
        user='api_user',
        password='apipassword',
        database='cement_dispatch',
        cursorclass=pymysql.cursors.DictCursor
    )

# --- STARTUP LOGIC ---
@app.on_event("startup")
def startup_event():
    """Automatically builds the MySQL table when the server boots."""
    try:
        conn = get_db_connection()
        with conn.cursor() as cursor:
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS sessions (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    belt_id VARCHAR(50),
                    start_time FLOAT,
                    end_time FLOAT,
                    total_count INT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
        conn.commit()
        conn.close()
        print("[INFO] MySQL connection successful. 'sessions' table ready.")
    except Exception as e:
        print(f"[ERROR] Could not connect to MySQL: {e}")

# --- PYDANTIC SCHEMAS ---
class CountPayload(BaseModel):
    belt_id: str
    count: int
    timestamp: float

class SessionPayload(BaseModel):
    belt_id: str
    start_time: float
    end_time: float
    total_count: int

# --- API ENDPOINTS ---
@app.post("/api/v1/count_increment")
def update_live_count(payload: CountPayload):
    # Overwrite the current live count in Redis instantly
    r.set(f"{payload.belt_id}:live_count", payload.count)
    r.set(f"{payload.belt_id}:last_updated", payload.timestamp)
    return {"status": "success", "redis_live_count": payload.count}

@app.post("/api/v1/session_completed")
def save_session(payload: SessionPayload):
    # 1. Save the final summary to MySQL
    conn = get_db_connection()
    with conn.cursor() as cursor:
        sql = "INSERT INTO sessions (belt_id, start_time, end_time, total_count) VALUES (%s, %s, %s, %s)"
        cursor.execute(sql, (payload.belt_id, payload.start_time, payload.end_time, payload.total_count))
    conn.commit()
    conn.close()
    
    # 2. Reset the Redis live count back to 0 for the next truck
    r.set(f"{payload.belt_id}:live_count", 0)
    
    print(f"[SUCCESS] Saved session for {payload.belt_id} to MySQL Vault.")
    return {"status": "success", "message": "Session saved to database"}
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