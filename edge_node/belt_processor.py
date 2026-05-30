import cv2
import time
import requests
import numpy as np
from ultralytics import YOLO

# --- CONFIGURATION ---
BELT_ID = "belt_01"
VIDEO_SOURCE = "A_fixed_static_top_down_came.mp4" 
FASTAPI_BASE_URL = "http://localhost:8000"

# Changed from Y to X for left-to-right movement
COUNTING_LINE_X = 100 
IDLE_THRESHOLD_SECONDS = 30

# --- STATE MACHINE VARIABLES ---
session_active = False
session_start_time = None
last_detection_time = None
total_session_count = 0
counted_ids = set() # To ensure we don't count the same bag twice

# Initialize YOLOv8 model (Nano for edge performance)
model = YOLO('best.pt') 

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
    global session_active, session_start_time, last_detection_time, total_session_count, counted_ids
    
    cap = cv2.VideoCapture(VIDEO_SOURCE)
    
    # Format: [Bottom-Left, Top-Left, Top-Right, Bottom-Right]
    roi_corners = np.array([[(350, 720), (430, 400), (720, 400), (700, 720)]], dtype=np.int32)
    
    while cap.isOpened():
        success, frame = cap.read()
        if not success:
            print("[INFO] Video stream ended or interrupted.")
            break
            
        current_time = time.time()

        # --- ROI MASKING (COMMENTED OUT FOR TESTING) ---
        # mask = np.zeros(frame.shape[:2], dtype=np.uint8)
        # cv2.fillPoly(mask, [roi_corners], 255)
        # masked_frame = cv2.bitwise_and(frame, frame, mask=mask)

        # --- YOLOv8 INFERENCE ---
        results = model.track(frame, tracker="bytetrack.yaml", persist=True, verbose=False, conf=0.6)
        
        if results[0].boxes.id is not None:
            boxes = results[0].boxes.xyxy.cpu()
            track_ids = results[0].boxes.id.int().cpu().tolist()
            
            for box, track_id in zip(boxes, track_ids):
                x1, y1, x2, y2 = box
                
                # CHANGED: Calculate the X center of the bounding box
                center_x = int((x1 + x2) / 2)
                y1_int, y2_int = int(y1), int(y2)
                
                # CHANGED: Check if the object's X center crosses the vertical line
                if center_x > COUNTING_LINE_X and track_id not in counted_ids:
                    counted_ids.add(track_id)
                    total_session_count += 1
                    last_detection_time = current_time
                    
                    # 1. State Machine: Start Session if idle
                    if not session_active:
                        session_active = True
                        session_start_time = current_time
                        print(f"--- [SESSION STARTED] Belt: {BELT_ID} ---")
                    
                    # 2. Fire live count increment to API
                    payload = {"belt_id": BELT_ID, "count": total_session_count, "timestamp": current_time}
                    send_http_post_with_retry("api/v1/count_increment", payload)

                # Draw bounding boxes and IDs
                cv2.rectangle(frame, (int(x1), int(y1)), (int(x2), int(y2)), (0, 255, 0), 2)
                cv2.putText(frame, f"ID: {track_id}", (int(x1), int(y1) - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 2)

        # --- STATE MACHINE: 30-SECOND RULE ---
        if session_active and last_detection_time:
            time_since_last_bag = current_time - last_detection_time
            if time_since_last_bag >= IDLE_THRESHOLD_SECONDS:
                print(f"--- [SESSION COMPLETED] 30s idle threshold reached for {BELT_ID}. ---")
                
                payload = {
                    "belt_id": BELT_ID,
                    "start_time": session_start_time,
                    "end_time": current_time,
                    "total_count": total_session_count
                }
                send_http_post_with_retry("api/v1/session_completed", payload)
                
                # Reset State Machine
                session_active = False
                session_start_time = None
                total_session_count = 0
                counted_ids.clear() 

        # --- VISUALIZATION ---
        
        # CHANGED: Draw a VERTICAL red counting line instead of horizontal
        # The line goes from (X, 0) at the top to (X, screen_height) at the bottom
        cv2.line(frame, (COUNTING_LINE_X, 0), (COUNTING_LINE_X, frame.shape[0]), (0, 0, 255), 2)
        
        # cv2.polylines(frame, [roi_corners], isClosed=True, color=(255, 0, 0), thickness=2)
        
        # Draw the current live count
        cv2.putText(frame, f"Live Count: {total_session_count}", (20, 40), cv2.FONT_HERSHEY_SIMPLEX, 1, (255, 0, 0), 3)
        
        cv2.imshow("Belt Camera View", frame)
        if cv2.waitKey(30) & 0xFF == ord("q"):
            break

    cap.release()
    cv2.destroyAllWindows()
if __name__ == "__main__":
    process_video()