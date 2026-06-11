# Cement Dispatch Monitoring System
**Developer Documentation & Technical Reference**

---

## 1. Project Overview

The **Cement Dispatch Monitoring System** is an automated, computer-vision-based solution designed to track cement bags as they are loaded onto dispatch wagons across 25 parallel conveyor belts. 

Instead of relying on human operators to tally bags manually, this system deploys **Edge AI nodes** (running YOLOv8 models) directly on the factory floor. These nodes detect bags crossing a line and send real-time HTTP events to a **Central Cloud/Local Server**, which aggregates the counts, manages "loading sessions," calculates real-time shift analytics, and provides a live dashboard for floor supervisors.

---

## 2. System Architecture

The project utilizes a **Hybrid Edge-Cloud Architecture**.

```mermaid
graph TD
    subgraph "Edge Devices (Factory Floor)"
        Camera[IP Camera - RTSP Stream] --> Edge[Edge Node Processor]
        Edge --> |Runs YOLOv8 + ByteTrack| Detections[Bag Detected Event]
        Detections --> |HTTP POST| Backend
    end

    subgraph "Central Server (Cloud / Local Data Center)"
        Backend[FastAPI Backend] <--> Redis[(Redis: Live State & Dedup)]
        Backend <--> MySQL[(MySQL: Historical Audits & Shifts)]
    end

    subgraph "Operator Control Room"
        Dashboard[React Web Dashboard] --> |HTTP GET (Polling)| Backend
        Dashboard --> |HTTP POST (Start/Stop)| Backend
    end
```

### 2.1 The Flow of Data
1. **Video Ingestion:** An RTSP stream from an IP camera is ingested by an edge node (`edge_node/belt_processor.py`).
2. **AI Inference:** A YOLOv8 model detects cement bags. ByteTrack assigns persistent IDs to them.
3. **Event Generation:** When a tracked bag crosses a defined horizontal line, an event is triggered.
4. **State Management:** The edge node POSTs the `bag_id` to the central backend. The backend checks Redis to ensure the bag hasn't already been counted (deduplication) and increments the live count.
5. **Dashboard Sync:** The React dashboard polls the backend every 5 seconds to get the latest live counts, edge node health, and overall shift statistics.

---

## 3. Technology Stack

### 🧠 Edge AI Node
* **Python 3.x**
* **Ultralytics YOLOv8 (Nano):** Chosen for its balance of high speed and accuracy on edge hardware.
* **ByteTrack:** A robust multi-object tracking algorithm that handles occlusions well.
* **OpenCV:** For video stream handling and frame drawing.
* **Requests:** For sending lightweight HTTP payloads to the backend.

### ⚙️ Central Backend
* **FastAPI:** A modern, high-performance web framework for Python. Handles high concurrency easily.
* **Redis:** Acts as the "Live State" engine. Stores active session data, live bag counts, and sets of processed bag IDs for O(1) deduplication lookups.
* **MySQL 8.0:** Acts as the "Permanent Vault". Stores completed session logs (`sessions` table) and aggregated shift summaries (`shifts` table).

### 🖥️ Frontend Dashboard
* **React 18 + Vite:** Fast, modern frontend framework.
* **Tailwind CSS v3:** Utility-first CSS framework for rapid UI development.
* **Lucide React:** Beautiful, consistent SVG icons.

### 🏗️ Infrastructure & Deployment
* **Docker & Docker Compose:** For local development and orchestration.
* **Docker Swarm:** For production deployment. Handles container placement (ensuring edge containers only run on GPU-enabled physical edge nodes using node labels).

---

## 4. Directory Structure

```text
cement-dispatch/
│
├── backend/                  # Central API Server
│   ├── main.py               # FastAPI application, routing, and DB logic
│   ├── requirements.txt      # Python dependencies
│   ├── Dockerfile            # Container definition
│   └── .env.example          # Environment variable template
│
├── frontend/                 # React Web Dashboard
│   ├── src/
│   │   ├── App.jsx           # Main UI logic (Tabs, State, Polling)
│   │   ├── main.jsx          # React DOM entry point
│   │   └── index.css         # Tailwind directives
│   ├── vite.config.js        # Vite bundler config
│   ├── tailwind.config.js    # Tailwind theme extensions
│   ├── package.json          # Node dependencies
│   ├── Dockerfile            # Build process + Nginx serving
│   └── nginx.conf            # Nginx routing config
│
├── edge_node/                # Edge AI Inference Scripts
│   ├── belt_processor.py     # Core CV script (reads video, runs YOLO, sends API calls)
│   ├── simulate_load.py      # Dev tool: simulates edge API calls without needing a GPU
│   ├── requirements.txt      # Python dependencies (assuming base image has torch/cv2)
│   └── Dockerfile            # Container definition (uses ultralytics base image)
│
└── infrastructure/           # Deployment & Orchestration
    ├── docker-compose.yml    # For local dev (spins up Redis + MySQL easily)
    ├── docker-swarm-stack.yml# Production swarm definition
    ├── deploy.sh             # Linux Swarm deployment automation
    ├── deploy.ps1            # Windows Swarm deployment automation
    └── DEPLOYMENT.md         # Comprehensive production deployment guide
```

---

## 5. Core Concepts & Lifecycles

### 5.1 The "Session" Lifecycle
A "session" represents a continuous period of loading bags onto a single belt.

1. **Idle:** The belt is off. The edge node is running but is ignoring bag crossings.
2. **Running:** The operator clicks "Start" on the dashboard. The backend creates a Redis key for the session. The edge node begins sending counts.
3. **Paused:** The operator clicks "Pause". The timer stops, and the edge node's counts are ignored by the backend.
4. **Completed:** The operator clicks "Stop". The backend takes the final count and duration from Redis, saves it as a permanent record in the MySQL `sessions` table, and deletes the Redis keys. The belt returns to `Idle`.

### 5.2 Shift Analytics
A "Shift" is defined dynamically by the system:
- **Shift Start:** Triggered automatically when the first belt changes from `idle` to `running`.
- **Shift Active:** While *any* belt is running or paused, the shift is considered active. The dashboard shows a live aggregate of all bags loaded.
- **Shift Complete:** When the *last* active belt is stopped (meaning all 25 belts are now `idle`), the backend automatically finalizes the shift. It calculates the total bags, duration, and belt-wise breakdown, and saves it to the MySQL `shifts` table.

### 5.3 Edge Node Health Tracking
Edge nodes run a background daemon thread that sends a `POST /api/v1/heartbeat` every 10 seconds.
The backend stores the last heartbeat timestamp in Redis. If a belt's last heartbeat is older than 15 seconds, the dashboard marks the belt as **OFFLINE**.

### 5.4 Bag Deduplication
Because CV tracking can sometimes lose and re-acquire a target (assigning it a new ID), deduplication is handled intelligently:
- The edge node assigns a unique ID to every bag it tracks across the line.
- When `POST /api/v1/count_increment` is called, the backend adds the `bag_id` to a Redis Set (`belt_XX:processed_bags`).
- If the ID is already in the set, the count is *not* incremented.

---

## 6. Local Development Setup

To work on this project locally, you don't need a GPU. You can simulate the edge nodes using the provided mock script.

### Prerequisites
- Docker Desktop
- Python 3.10+
- Node.js 18+

### Step 1: Start Databases
```bash
cd infrastructure
docker-compose up -d
```
*This spins up Redis on port 6379 and MySQL on port 3306.*

### Step 2: Start the Backend
```bash
cd backend
python -m venv venv
# Windows: venv\Scripts\activate | Mac/Linux: source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### Step 3: Start the Frontend
```bash
cd frontend
npm install
npm run dev
```
*Open `http://localhost:5173` in your browser.*

### Step 4: Simulate Edge Traffic
Since you likely don't have 25 RTSP cameras and a massive GPU locally, use the simulator to send fake bag counts to the backend:
```bash
cd edge_node
python simulate_load.py
```
*Go to the dashboard, click "Start" on some belts, and watch the simulator automatically increment the counts.*

---

## 7. Production Deployment

The system is deployed using **Docker Swarm**. 

Production deployment requires:
1. A Manager node (Central Server).
2. Worker nodes with GPUs (Edge Devices).
3. Using `docker node update --label-add gpu=true <node_id>` to pin workloads correctly.

For full step-by-step production instructions, see **[infrastructure/DEPLOYMENT.md](infrastructure/DEPLOYMENT.md)**.

---

## 8. Known Gaps / Pending Work
As of the current version, the core logic is complete, but the following production-hardening tasks remain:

1. **Security (JWT Auth):** The FastAPI endpoints currently lack authentication. A JWT login system must be implemented for the dashboard, and a static API key header must be implemented for edge-node communication.
2. **RTSP Reconnect Logic:** `belt_processor.py` needs a robust `try/except` loop around `cv2.VideoCapture` to automatically reconnect if a factory IP camera drops off the network temporarily.
