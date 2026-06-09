import requests
import threading
import time
import random
import uuid

# --- CONFIGURATION ---
BASE_URL = "http://127.0.0.1:8000"
NUM_BELTS = 25
MIN_BAGS = 15
MAX_BAGS = 30

# --- TELEMETRY TRACKING ---
stats_lock = threading.Lock()
success_count = 0
failure_count = 0
latencies = []
session_expected_counts = {}

def track_request(method, endpoint, payload=None):
    """Wrapper to execute HTTP requests and track latency/success telemetry."""
    global success_count, failure_count
    url = f"{BASE_URL}/{endpoint}"
    start_time = time.time()
    try:
        if method == "POST":
            response = requests.post(url, json=payload, timeout=5)
        else:
            response = requests.get(url, timeout=5)
        
        latency = (time.time() - start_time) * 1000  # Convert to ms
        
        with stats_lock:
            latencies.append(latency)
            if response.status_code == 200:
                success_count += 1
                return response.json()
            else:
                failure_count += 1
                print(f"[ERROR] API returned status {response.status_code} for {endpoint}")
    except Exception as e:
        with stats_lock:
            failure_count += 1
        print(f"[EXCEPTION] Request failed for {endpoint}: {e}")
    return None

def simulate_belt(belt_num):
    """Simulates a single conveyor belt session lifecycle and counting."""
    belt_id = f"belt_{belt_num:02d}"
    target_count = random.randint(MIN_BAGS, MAX_BAGS)
    
    with stats_lock:
        session_expected_counts[belt_id] = target_count
        
    # 0. Register Heartbeat
    track_request("POST", "api/v1/heartbeat", {"belt_id": belt_id, "timestamp": time.time()})
        
    # 1. Start the Session
    track_request("POST", "api/v1/session/start", {"belt_id": belt_id})
    print(f"[{belt_id}] Started session. Target bag count: {target_count}")
    
    # Choose a random bag count at which we will pause the belt (e.g. at 40% of completion)
    pause_index = max(2, int(target_count * 0.4))
    
    for i in range(1, target_count + 1):
        # Simulate time spacing between bags
        time.sleep(random.uniform(0.05, 0.20))
        
        # Send bag crossing event
        bag_id = f"{belt_id}_bag_{uuid.uuid4().hex[:8]}"
        track_request("POST", "api/v1/count_increment", {
            "belt_id": belt_id,
            "bag_id": bag_id,
            "timestamp": time.time()
        })
        
        # Trigger pause and resume sequence
        if i == pause_index:
            print(f"[{belt_id}] Pausing belt at bag {i}/{target_count} due to simulated interruption...")
            track_request("POST", "api/v1/session/pause", {"belt_id": belt_id})
            
            # Keep it paused for 1.5 seconds
            time.sleep(1.5)
            
            print(f"[{belt_id}] Resuming belt...")
            track_request("POST", "api/v1/session/resume", {"belt_id": belt_id})
            
    # 2. Complete the Session
    track_request("POST", "api/v1/session/complete", {"belt_id": belt_id})
    print(f"[{belt_id}] Completed session with final count: {target_count}")

def run_load_test():
    print(f"=== Starting Load Test (25 Concurrent Streams) ===")
    threads = []
    start_time = time.time()
    
    # Spawn 25 concurrent threads
    for i in range(1, NUM_BELTS + 1):
        t = threading.Thread(target=simulate_belt, args=(i,))
        threads.append(t)
        t.start()
        
    # Wait for all threads to finish
    for t in threads:
        t.join()
        
    total_time = time.time() - start_time
    total_reqs = success_count + failure_count
    success_rate = (success_count / total_reqs * 100) if total_reqs > 0 else 0
    avg_latency = (sum(latencies) / len(latencies)) if latencies else 0
    
    print("\n=== Test Telemetry Summary ===")
    print(f"Total Simulated Streams: {NUM_BELTS}")
    print(f"Total Requests Executed: {total_reqs}")
    print(f"Successful Requests    : {success_count}")
    print(f"Failed Requests        : {failure_count}")
    print(f"Success Rate           : {success_rate:.2f}%")
    print(f"Avg Request Latency    : {avg_latency:.2f} ms")
    print(f"Min Request Latency    : {min(latencies):.2f} ms" if latencies else "N/A")
    print(f"Max Request Latency    : {max(latencies):.2f} ms" if latencies else "N/A")
    print(f"Total Elapsed Time     : {total_time:.2f} seconds")
    
    # --- POST-TEST DATABASE INTEGRITY VERIFICATION ---
    print("\n=== Running Database Integrity Check ===")
    time.sleep(2)  # Short pause to ensure final DB commits are flushed
    
    sessions_data = track_request("GET", "api/v1/sessions")
    if not sessions_data:
        print("[FAIL] Could not retrieve completed sessions from backend.")
        return
        
    saved_sessions = sessions_data.get("sessions", [])
    db_lookup = {}
    for s in saved_sessions:
        b_id = s.get("belt_id")
        # Keep only the newest session record for each belt_id
        if b_id not in db_lookup:
            db_lookup[b_id] = s
            
    mismatches = 0
    missing = 0
    
    for belt_id, expected_count in session_expected_counts.items():
        if belt_id not in db_lookup:
            print(f"[FAIL] Missing database entry for {belt_id}!")
            missing += 1
            continue
            
        record = db_lookup[belt_id]
        saved_count = record.get("total_count")
        duration = record.get("end_time") - record.get("start_time")
        
        if saved_count != expected_count:
            print(f"[FAIL] Count mismatch for {belt_id}! Expected: {expected_count}, Saved in DB: {saved_count}")
            mismatches += 1
        else:
            print(f"[PASS] {belt_id} -> Saved Count: {saved_count}, Active Duration: {duration:.2f}s")
            
    if mismatches == 0 and missing == 0:
        print("\n[SUCCESS] Integrity Check Passed! All 25 concurrent sessions matched expectations exactly.")
    else:
        print(f"\n[FAIL] Verification failed. Mismatches: {mismatches}, Missing: {missing}")

if __name__ == "__main__":
    run_load_test()
