# Cement Factory Dispatch Monitoring System
## Comprehensive System & Code Documentation

This document compiles the **Software Requirements Specification (SRS)**, **Activity & Data Flow Design**, and **Codebase Implementations** for the Cement Factory Dispatch Monitoring System.

---

## 1. Executive Summary & Goals
The **Cement Factory Dispatch Monitoring System** is a real-time, computer-vision-driven solution designed to automate and monitor the dispatch loading process at a cement plant.

### Core Objectives:
* **Automated Counting**: Automatically count cement bags loaded onto dispatch wagons from **25 conveyor belts** using **25 IP cameras** (1 camera per belt).
* **Session Tracking**: Track the duration and loading history of each dispatch wagon.
* **Low-Latency Monitoring**: Expose real-time bag counts and status updates to a centralized dashboard.
* **Historical Auditing**: Persist completed session summaries to a relational database for auditing and operational planning.

---

## 2. System Architecture & Tech Stack

The system is designed with a decentralized, three-tier architecture to handle heavy video processing at the edge while keeping the central server lightweight and scalable.

```
                   +-------------------+
                   |   25 IP Cameras   |
                   +---------+---------+
                             | RTSP
                             v
               +-------------+-------------+
               |   Edge Processing Layer   |
               | (YOLOv8 + ByteTrack / GPU)|
               +-------------+-------------+
                             | HTTP/REST (JSON Events)
                             v
               +-------------+-------------+
               |    Central Backend API    |
               |         (FastAPI)         |
               +-------+-------------+-----+
                       |             |
                 RESP  |             | TCP/IP
                       v             v
                +------+------+ +----+----+
                | Redis Cache | |  MySQL  |
                | (Live State)| | (Vault) |
                +-------------+ +---------+
                       ^
                       | Polls status (5s) / Controls (HTTP POST)
                +------+------+
                | React + Vite|
                |  Dashboard  |
                +-------------+
```

### Technology Stack details:
* **Edge Inference**: YOLOv8 (Nano model for edge performance) + ByteTrack for object detection and persistent tracking. Runs inside Docker containers to allow access to local GPU resources.
* **Orchestration**: Docker Swarm manages container placements across **5–6 physical edge GPU nodes** (running 4–5 stream containers per node) and supports automatic container recovery.
* **Central Backend**: FastAPI (Python) web server handling lightweight API events.
* **Caching (Live State)**: Redis (In-memory database) for sub-millisecond status updates and real-time dashboard consumption.
* **Relational Storage (Permanent Vault)**: MySQL for persisting audited session results.
* **Frontend**: React + Vite + Tailwind CSS v3 Web Dashboard (polls status every 5 seconds to reduce server load and performs client-side optimistic timer ticks for a smooth UI experience).

---

## 3. System Interfaces & Data Flow

### 3.1 Session Lifecycle States
Unlike a fixed timer-based loop, the session lifecycle is controlled manually by operators via the dashboard to accommodate deliberate conveyor belt stops:

```mermaid
stateDiagram-v2
    [*] --> Idle
    Idle --> Running : POST /session/start
    Running --> Paused : POST /session/pause
    Paused --> Running : POST /session/resume
    Running --> Idle : POST /session/complete (Saves to MySQL)
    Paused --> Idle : POST /session/complete (Saves to MySQL)
```

1. **Idle**: The conveyor belt is inactive, and no session is running. All camera crossings are ignored.
2. **Running**: An active loading session is in progress. The edge node tracks bags crossing the line and reports increments.
3. **Paused**: The loading process is temporarily suspended (e.g., belt stopped for adjustments). Crossing events are ignored, and the session's active loading timer is frozen.

### 3.2 Deduplication Strategy
To prevent double-counting caused by network retries or back-and-forth movement, the edge node assigns a persistent ID to each bag using **ByteTrack**. When a bag crosses the counting boundary, the edge reports the crossing event with a unique `bag_id`. 

The backend stores counted bag IDs inside a **Redis Set** for the active session. If a request containing an already processed `bag_id` arrives, the backend ignores it.

---

## 4. Codebase Specification

### 4.1 Central Backend: [backend/main.py](file:///c:/Users/13shi/Pictures/cement-dispatch/backend/main.py)
The central backend defines schemas and exposes API endpoints to update Redis and persist completed records in MySQL.

#### Configuration:
* Loaded from `.env` via `python-dotenv` at startup. Falls back to default values if not defined.
* **Database Connections**: Configured to bypass Windows IPv6 resolution latency by targeting `127.0.0.1` explicitly.

#### Exposed Endpoints:
* **`POST /api/v1/session/start`**: Resets the Redis live count to 0, deletes old deduplication sets, and transitions status to `"running"`.
* **`POST /api/v1/session/pause`**: Transitions status to `"paused"` and logs the pause timestamp.
* **`POST /api/v1/session/resume`**: Calculates the paused duration and transitions status back to `"running"`.
* **`POST /api/v1/session/complete`**: Stops the active session, calculates the net active loading duration (excluding paused time), inserts a row in MySQL, resets Redis status to `"idle"`, and clears deduplication sets.
* **`GET /api/v1/session/status/{belt_id}`**: Dynamically calculates and returns current status, live count, and running active duration.
* **`POST /api/v1/count_increment`**: Performs Redis Set deduplication and increments the live count.
* **`GET /api/v1/sessions`**: Fetches the latest 50 completed sessions from MySQL.

---

### 4.2 Edge Node: [edge_node/belt_processor.py](file:///c:/Users/13shi/Pictures/cement-dispatch/edge_node/belt_processor.py)
Runs locally on the edge nodes and manages the camera streams.

#### Core Loop:
1. **Background Polling Thread**: Checks the backend `/api/v1/session/status/{belt_id}` endpoint every 1.0s to dynamically adjust its internal status (`running`, `paused`, `idle`).
2. **YOLOv8 & ByteTrack Ingestion**: Ingests RTSP stream frames, detects cement bags, and tracks them using persistent tracking IDs.
3. **Boundary Check**: If the bag center crosses `COUNTING_LINE_X`, it qualifies as a crossing.
4. **Action**:
   * If status is `"running"` and the ID is new, it sends a payload to `/api/v1/count_increment` with the tracking ID as the `bag_id`.
   * Otherwise, the crossing is discarded.
5. **OpenCV GUI Overlay**: Draws bounding boxes, tracking IDs, the counting boundary, and displays the live status and count fetched from the backend.

---

### 4.3 Web Dashboard: [frontend/src/App.jsx](file:///c:/Users/13shi/Pictures/cement-dispatch/frontend/src/App.jsx)
A highly responsive React dashboard styled with Tailwind CSS.

* **Grid Layout**: Displays status cards for all 25 conveyor belts.
* **Session Controls**: Direct control of each belt's session state (`Start`, `Pause`, `Resume`, `Complete`).
* **Optimized Polling**: Polls statuses and completed sessions at a 5-second interval.
* **Client-Side Timer ticking**: Updates active session elapsed timers smoothly in the UI every 1.0s without flooding backend APIs.
* **Audit Logs**: Displays completed sessions directly from the MySQL database.

---

### 4.4 Load Simulation: [edge_node/simulate_load.py](file:///c:/Users/13shi/Pictures/cement-dispatch/edge_node/simulate_load.py)
A tool to simulate concurrency and test backend capacity.
* Simulates 25 concurrent streams pushing bag counts.
* Validates deduplication and concurrent writes under heavy loads.

---

### 4.5 Database Infrastructure & Containerization
* **Local Development**: [infrastructure/docker-compose.yml](file:///c:/Users/13shi/Pictures/cement-dispatch/infrastructure/docker-compose.yml) spins up developer instances of Redis and MySQL.
* **Production Scaling**: [infrastructure/docker-swarm-stack.yml](file:///c:/Users/13shi/Pictures/cement-dispatch/infrastructure/docker-swarm-stack.yml) defines the swarm orchestration for 25 belts:
  * Scales the FastAPI backend.
  * Schedules edge containers onto physical GPU nodes using Docker constraints.
  * Connects container streams to NVIDIA GPUs for hardware acceleration.
* **Docker Blueprints**:
  * [backend/Dockerfile](file:///c:/Users/13shi/Pictures/cement-dispatch/backend/Dockerfile): Python 3.11-slim, packages installed from `requirements.txt`.
  * [edge_node/Dockerfile](file:///c:/Users/13shi/Pictures/cement-dispatch/edge_node/Dockerfile): Ultralytics base image (includes PyTorch, CUDA, OpenCV), custom weights.
  * [frontend/Dockerfile](file:///c:/Users/13shi/Pictures/cement-dispatch/frontend/Dockerfile): Multi-stage container. Builds react assets and serves them via Nginx configured for React routing.

---

## 5. Local Setup & Execution Guide

Follow these steps to run the complete pipeline on your local environment:

### Step 1: Clone and Configure Environment Variables
Copy `.env.example` templates to `.env` in both backend and edge_node directories:
```powershell
cp backend/.env.example backend/.env
cp edge_node/.env.example edge_node/.env
```
*(Customize backend credentials and edge camera options in your local `.env` files.)*

### Step 2: Start Databases
Ensure Docker Desktop is running, navigate to the `infrastructure` folder, and start the databases:
```powershell
cd infrastructure
docker-compose up -d
```

### Step 3: Install Python & Node Dependencies
Install the required packages:
```powershell
# Backend Dependencies
cd ../backend
pip install -r requirements.txt

# Edge Node Dependencies
cd ../edge_node
pip install -r requirements.txt

# Frontend Dependencies
cd ../frontend
npm install
```

### Step 4: Run the Central Backend
Start the FastAPI server from the `backend` folder:
```powershell
cd ../backend
uvicorn main:app --reload --port 8000
```
*The API interactive documentation will be available at http://localhost:8000/docs.*

### Step 5: Run the Frontend Dashboard
Start the Vite developer server from the `frontend` folder:
```powershell
cd ../frontend
npm run dev
```
*Access the Web UI dashboard at http://localhost:5173/.*

### Step 6: Run the Edge Processor
Run the vision simulator from the `edge_node` folder:
```powershell
cd ../edge_node
python belt_processor.py
```
*An OpenCV window will appear showing the video feed in an `IDLE` state. As you start, pause, and complete sessions from the frontend dashboard, the edge processor will automatically synchronize and begin sending detections.*
