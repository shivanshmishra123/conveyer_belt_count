from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import time

app = FastAPI(title="Cement Factory Dispatch API")

# --- Pydantic Models for Data Validation ---
class CountPayload(BaseModel):
    belt_id: str
    count: int
    timestamp: float

class SessionPayload(BaseModel):
    belt_id: str
    start_time: float
    end_time: float
    total_count: int

# --- API Endpoints ---

@app.post("/api/v1/count_increment")
async def receive_count_increment(payload: CountPayload):
    """
    Receives live bag counts from the Edge Node.
    Currently prints to console; later will write to Redis.
    """
    # TODO: Add Redis write logic here (FR-3.2)
    print(f"[LIVE UPDATE] {payload.belt_id} | Total Count: {payload.count}")
    return {"status": "success", "message": "Count logged"}

@app.post("/api/v1/session_completed")
async def receive_session_completed(payload: SessionPayload):
    """
    Receives final session data when the 30-second idle threshold is hit.
    Currently prints to console; later will persist to MySQL.
    """
    duration = round(payload.end_time - payload.start_time, 2)
    # TODO: Add MySQL persistence logic here (FR-3.3)
    print(f"\n{'='*50}")
    print(f"[SESSION COMPLETED] {payload.belt_id}")
    print(f"Total Bags: {payload.total_count}")
    print(f"Duration: {duration} seconds")
    print(f"{'='*50}\n")
    
    return {"status": "success", "message": "Session recorded"}

@app.get("/")
async def root():
    return {"message": "Cement Factory Backend is running."}