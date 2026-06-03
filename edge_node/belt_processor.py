import cv2
import time
import requests
import numpy as np
from ultralytics import YOLO
import threading

# --- CONFIGURATION ---
BELT_ID = "belt_01"
VIDEO_SOURCE = "A_fixed_static_top_down_came.mp4" 
FASTAPI_BASE_URL = "http://127.0.0.1:8000"

COUNTING_LINE_X = 100 

# --- STATE MACHINE VARIABLES ---
session_status = "idle"  # "idle", "running", "paused"
session_live_count = 0
counted_ids = set() # To ensure we don't count the same bag twice

# Initialize YOLOv8 model (Nano for edge performance)
model = YOLO('best.pt') 

def poll_backend_status():
    global session_status, session_live_count
    url = f"{FASTAPI_BASE_URL}/api/v1/session/status/{BELT_ID}"
    while True:
        try:
            response = requests.get(url, timeout=2)
            if response.status_code == 200:
                data = response.json()
                new_status = data.get("status", "idle")
                new_count = data.get("live_count", 0)
                if new_status != session_status:
                    print(f"[STATUS CHANGE] Backend status transitioned from {session_status} to {new_status}")
                session_status = new_status
                session_live_count = new_count
        except Exception as e:
            pass
        time.sleep(1.0)

def send_http_post_with_retry(endpoint, payload, max_retries=3):
    """Sends HTTP POST with exponential backoff for fault tolerance (NFR-3.1)."""
    url = f"{FASTAPI_BASE_URL}/{endpoint}"
    for attempt in range(max_retries):
        try:
            response = requests.post(url, json=payload, timeout=5)
            if response.status_code == 200:
                print(f"[SUCCESS] Sent {endpoint}: {payload}")
                return True
        except requests.exceptions.RequestException as e:
            wait_time = 2 ** attempt
            print(f"[WARNING] HTTP Error: {e}. Retrying in {wait_time}s...")
            time.sleep(wait_time)
    print(f"[ERROR] Failed to send {endpoint} after {max_retries} attempts.")
    return False
def process_video():
    global session_status, session_live_count, counted_ids
    
    cap = cv2.VideoCapture(VIDEO_SOURCE)
    
    # Format: [Bottom-Left, Top-Left, Top-Right, Bottom-Right]
    roi_corners = np.array([[(350, 720), (430, 400), (720, 400), (700, 720)]], dtype=np.int32)
    
    last_status = "idle"
    
    while cap.isOpened():
        success, frame = cap.read()
        if not success:
            print("[INFO] Video stream ended or interrupted.")
            break
            
        current_time = time.time()

        # Check for status changes to clear tracked IDs
        if last_status != session_status:
            if session_status in ["running", "idle"]:
                counted_ids.clear()
                print(f"[INFO] Status changed to {session_status}. Cleared tracked bags.")
            last_status = session_status

        # --- YOLOv8 INFERENCE ---
        results = model.track(frame, tracker="bytetrack.yaml", persist=True, verbose=False, conf=0.6)
        
        if results[0].boxes.id is not None:
            boxes = results[0].boxes.xyxy.cpu()
            track_ids = results[0].boxes.id.int().cpu().tolist()
            
            for box, track_id in zip(boxes, track_ids):
                x1, y1, x2, y2 = box
                center_x = int((x1 + x2) / 2)
                
                # Check if the object's X center crosses the vertical line
                if center_x > COUNTING_LINE_X and track_id not in counted_ids:
                    counted_ids.add(track_id)
                    
                    if session_status == "running":
                        payload = {
                            "belt_id": BELT_ID,
                            "bag_id": str(track_id),
                            "timestamp": current_time
                        }
                        send_http_post_with_retry("api/v1/count_increment", payload)
                    else:
                        print(f"[INFO] Bag {track_id} ignored crossing since belt status is {session_status}")

                # Draw bounding boxes and IDs
                cv2.rectangle(frame, (int(x1), int(y1)), (int(x2), int(y2)), (0, 255, 0), 2)
                cv2.putText(frame, f"ID: {track_id}", (int(x1), int(y1) - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 2)

        # --- VISUALIZATION ---
        
        # Draw a VERTICAL red counting line instead of horizontal
        cv2.line(frame, (COUNTING_LINE_X, 0), (COUNTING_LINE_X, frame.shape[0]), (0, 0, 255), 2)
        
        # Draw status and the current live count from backend (Redis)
        status_color = (0, 255, 0) if session_status == "running" else (0, 165, 255) if session_status == "paused" else (0, 0, 255)
        cv2.putText(frame, f"Status: {session_status.upper()}", (20, 40), cv2.FONT_HERSHEY_SIMPLEX, 1, status_color, 3)
        cv2.putText(frame, f"Live Count: {session_live_count}", (20, 80), cv2.FONT_HERSHEY_SIMPLEX, 1, (255, 0, 0), 3)
        
        cv2.imshow("Belt Camera View", frame)
        if cv2.waitKey(30) & 0xFF == ord("q"):
            break

    cap.release()
    cv2.destroyAllWindows()
if __name__ == "__main__":
    # Start background polling thread
    t = threading.Thread(target=poll_backend_status, daemon=True)
    t.start()
    process_video()