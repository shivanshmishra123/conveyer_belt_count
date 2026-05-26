import cv2
import time
import requests
from ultralytics import YOLO
import numpy as np

# --- CONFIGURATION ---
BELT_ID = "belt_01"
# Use a webcam (0) for testing, or replace with an RTSP URL: "rtsp://camera_ip:port/stream"
VIDEO_SOURCE = "conveyor_footage.mp4" 
FASTAPI_BASE_URL = "http://localhost:8000"

# Virtual line for counting (Y-coordinate). Adjust based on camera angle.
COUNTING_LINE_Y = 600 
IDLE_THRESHOLD_SECONDS = 30

# --- STATE MACHINE VARIABLES ---
session_active = False
session_start_time = None
last_detection_time = None
total_session_count = 0
counted_ids = set() # To ensure we don't count the same bag twice

# Initialize YOLOv8 model
model = YOLO('yolov8n.pt') 

def send_http_post_with_retry(endpoint, payload, max_retries=3):
    """Sends HTTP POST with exponential backoff for fault tolerance."""
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
    
    while cap.isOpened():
        success, frame = cap.read()
        if not success:
            print("[INFO] Video stream ended or interrupted.")
            break
            
        current_time = time.time()

        # Run YOLOv8 tracking with ByteTrack
        # persist=True keeps tracking IDs across frames
        results = model.track(frame, tracker="bytetrack.yaml", persist=True, verbose=False)
        
        bags_detected_this_frame = False

        if results[0].boxes.id is not None:
            boxes = results[0].boxes.xyxy.cpu()
            track_ids = results[0].boxes.id.int().cpu().tolist()
            
            for box, track_id in zip(boxes, track_ids):
                x1, y1, x2, y2 = box
                center_y = int((y1 + y2) / 2)
                
                # Check if the object's center crosses our virtual counting line
                if center_y > COUNTING_LINE_Y and track_id not in counted_ids:
                    bags_detected_this_frame = True
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

                # Draw bounding boxes and IDs for visual debugging
                cv2.rectangle(frame, (int(x1), int(y1)), (int(x2), int(y2)), (0, 255, 0), 2)
                cv2.putText(frame, f"ID: {track_id}", (int(x1), int(y1) - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 2)

        # 3. State Machine: Check 30-second idle threshold
        if session_active and last_detection_time:
            time_since_last_bag = current_time - last_detection_time
            if time_since_last_bag >= IDLE_THRESHOLD_SECONDS:
                print(f"--- [SESSION COMPLETED] 30s idle threshold reached for {BELT_ID}. ---")
                
                # Fire session completed payload
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
                counted_ids.clear() # Clear memory for next session

        # Draw the virtual counting line and current count
        cv2.line(frame, (0, COUNTING_LINE_Y), (frame.shape[1], COUNTING_LINE_Y), (0, 0, 255), 2)
        cv2.putText(frame, f"Live Count: {total_session_count}", (20, 40), cv2.FONT_HERSHEY_SIMPLEX, 1, (255, 0, 0), 3)
        
        cv2.imshow("Belt Camera View", frame)
        if cv2.waitKey(1) & 0xFF == ord("q"):
            break

    cap.release()
    cv2.destroyAllWindows()

if __name__ == "__main__":
    process_video()