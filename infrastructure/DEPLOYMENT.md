# Cement Dispatch — Deployment Guide

A plain-English, step-by-step guide to getting this system running in production.

---

## Quick Summary (Read This First)

The system has **3 types of machines**:

| Machine | What it runs | Where it sits |
|---|---|---|
| **Central Server** (1 machine) | Backend API, Dashboard Website, Redis, MySQL | Server room or cloud VM |
| **Edge Nodes** (1+ machines) | Camera feed + AI bag detection | Near the conveyor belts, with a GPU |
| **Operator's Browser** (any laptop) | Opens the dashboard website | Anywhere on the same network |

**The deployment flow is:**
1. Set up the Central Server → run one script → it starts everything.
2. For each Edge Node → join it to the server → label it → the AI container starts automatically.
3. Open the dashboard in a browser → start belts → bags get counted.

---

## 1. What You Need Before Starting

### Central Server
- Any Windows or Linux machine (no GPU needed).
- **Docker** installed.
  - Windows: Install [Docker Desktop](https://www.docker.com/products/docker-desktop/).
  - Linux: Install [Docker Engine](https://docs.docker.com/engine/install/).
- Ports `8000` (backend), `5173` or `80` (frontend), `6379` (Redis), and `3306` (MySQL) should be available.

### Each Edge Node
- A **Linux machine** (Ubuntu 22.04 recommended).
- An **NVIDIA GPU** with drivers installed.
- **Docker Engine** installed.
- **NVIDIA Container Toolkit** installed — this lets Docker containers use the GPU.
  ```bash
  # Install NVIDIA Container Toolkit (Ubuntu)
  distribution=$(. /etc/os-release; echo $ID$VERSION_ID)
  curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | sudo gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg
  curl -s -L https://nvidia.github.io/libnvidia-container/$distribution/libnvidia-container.list | \
    sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' | \
    sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list
  sudo apt-get update && sudo apt-get install -y nvidia-container-toolkit
  sudo nvidia-ctk runtime configure --runtime=docker
  sudo systemctl restart docker
  ```
- The camera's **RTSP URL** for the belt this node will monitor (get this from the camera vendor or IT team).

---

## 2. Deploy the Central Server (One-Time Setup)

This is the easiest part. One script does everything.

### Step 1: Clone the repo
```bash
git clone https://github.com/shivanshmishra123/conveyer_belt_count.git cement-dispatch
cd cement-dispatch/infrastructure
```

### Step 2: Run the deployment script
- **Windows (PowerShell):**
  ```powershell
  .\deploy.ps1
  ```
- **Linux (Bash):**
  ```bash
  chmod +x deploy.sh
  ./deploy.sh
  ```

**What this script does automatically:**
1. Initializes Docker Swarm (makes this machine the "manager").
2. Builds Docker images for the Backend and Frontend.
3. Deploys all central services (Redis, MySQL, Backend API, Frontend).

### Step 3: Verify it's running
```bash
docker service ls
```
You should see services like `cement_dispatch_redis`, `cement_dispatch_mysql`, `cement_dispatch_backend`, all showing `1/1` replicas.

Open the dashboard at: **`http://<SERVER_IP>:8000`** (or whatever port the frontend is mapped to).

> **Note:** MySQL takes about 15–20 seconds to fully start on the first run. If the backend shows connection errors in logs, just wait a moment — it will auto-retry.

---

## 3. Connect an Edge Node (Repeat for Each Belt)

Each physical edge device needs to be "joined" to the central server's Docker Swarm cluster.

### Step 1: Get the join command

On the **Central Server**, run:
```bash
docker swarm join-token worker
```
It will print something like:
```
docker swarm join --token SWMTKN-1-abc123xyz... 192.168.1.100:2377
```
Copy this entire command.

### Step 2: Join the edge node to the swarm

Log into the **Edge Node** (SSH or physical terminal) and paste the command from Step 1:
```bash
docker swarm join --token SWMTKN-1-abc123xyz... 192.168.1.100:2377
```
You should see: `This node joined a swarm as a worker.`

### Step 3: Build the AI image on the edge node

The edge container needs to be built locally on the edge device (because it includes GPU libraries):
```bash
# Copy the edge_node folder to this machine first (via SCP, USB, etc.)
cd edge_node
docker build -t cement-dispatch-edge:latest .
```

> **Tip:** If your company has a private Docker Registry (e.g., Harbor, Nexus, or AWS ECR), you can push the image once and all edge nodes will pull it automatically — no manual copying needed.

### Step 4: Label the edge node

Back on the **Central Server**, list all connected nodes:
```bash
docker node ls
```

Find the edge node's ID, then label it:
```bash
# Replace <node_id> with the actual ID from the list
docker node update --label-add gpu=true <node_id>
docker node update --label-add edge_id=node_01 <node_id>
```

**What the labels mean:**
- `gpu=true` → tells Swarm this machine has a GPU (so it's eligible for AI workloads).
- `edge_id=node_01` → pins a specific belt's container to this specific machine.

As soon as you apply the labels, Docker Swarm will automatically start the `edge_processor_belt_01` container on that node. No extra commands needed.

---

## 4. Configure Each Belt's Camera and Counting Line

Each belt's edge processor needs to know:
1. **Which belt it is** (`belt_01`, `belt_02`, etc.)
2. **Where the camera stream is** (RTSP URL)
3. **Where the counting line is** (Y-pixel position in the video frame)

These are set in the `docker-swarm-stack.yml` file under each edge service:

```yaml
edge_processor_belt_01:
  image: cement-dispatch-edge:latest
  environment:
    - BELT_ID=belt_01
    - VIDEO_SOURCE=rtsp://admin:password@10.0.1.51/stream1   # ← Your camera's RTSP URL
    - FASTAPI_BASE_URL=http://backend:8000
    - COUNTING_LINE_Y=400                                      # ← Adjust per camera
```

### How to find the right `COUNTING_LINE_Y` value

The counting line is a horizontal line drawn across the video. A bag is counted when it passes **below** this line (bags move top to bottom).

1. Temporarily run `belt_processor.py` with a monitor connected to see the live video.
2. You'll see a **red horizontal line** across the frame.
3. If bags are counted too early → **increase** the value (moves line down).
4. If bags are counted too late or missed → **decrease** the value (moves line up).
5. Good starting point: **60–70% of the frame height** (e.g., if frame is 720px tall, try `450`).

After changing the value in `docker-swarm-stack.yml`, redeploy:
```bash
docker stack deploy -c docker-swarm-stack.yml cement_dispatch
```
Swarm will rolling-update only the changed services.

---

## 5. Adding More Belts (Scaling)

To add belt #3, #4, ..., #25:

1. **Add a new service block** in `docker-swarm-stack.yml` (copy the `edge_processor_belt_01` block and change `BELT_ID`, `VIDEO_SOURCE`, `edge_id`, and `COUNTING_LINE_Y`).

2. **Label the edge node** that will run this belt:
   ```bash
   docker node update --label-add gpu=true <node_id>
   docker node update --label-add edge_id=node_02 <node_id>
   ```

3. **Redeploy:**
   ```bash
   docker stack deploy -c docker-swarm-stack.yml cement_dispatch
   ```

> **Can one edge node run multiple belts?** Yes — if the GPU has enough memory. Two belts on one GPU is usually fine for YOLOv8 Nano. Set both services to the same `edge_id` label.

---

## 6. Day-to-Day Operations

### Check if everything is running
```bash
docker service ls
```
All services should show `1/1` (or `3/3` for the backend which runs 3 replicas).

### See why a service isn't starting
```bash
docker service ps cement_dispatch_edge_processor_belt_01 --no-trunc
```
Common reasons: node not labeled, image not built on that node, GPU not detected.

### View live backend logs
```bash
docker service logs cement_dispatch_backend -f
```

### View edge node logs
```bash
docker service logs cement_dispatch_edge_processor_belt_01 -f
```

### Restart a specific service
```bash
docker service update --force cement_dispatch_backend
```

### Stop everything (gracefully)
```bash
docker stack rm cement_dispatch
```
This stops all services but **keeps your MySQL data** (it's stored in a Docker volume).

---

## 7. Data Management

### Clear all live state (Redis)
Use this when you want a fresh start for the current shift — clears live counts, session states, and dedup sets:
```bash
docker exec $(docker ps -q -f name=cement_dispatch_redis) redis-cli FLUSHALL
```

### Clear all historical records (MySQL)
Use this to wipe all completed sessions and shift history:
```bash
docker exec $(docker ps -q -f name=cement_dispatch_mysql) mysql -u api_user -papipassword cement_dispatch -e "TRUNCATE TABLE sessions; TRUNCATE TABLE shifts;"
```

### Backup MySQL data
```bash
docker exec $(docker ps -q -f name=cement_dispatch_mysql) mysqldump -u api_user -papipassword cement_dispatch > backup_$(date +%Y%m%d).sql
```

### Restore from backup
```bash
cat backup_20260701.sql | docker exec -i $(docker ps -q -f name=cement_dispatch_mysql) mysql -u api_user -papipassword cement_dispatch
```

---

## 8. Networking Checklist

Make sure these ports are open between machines:

| From | To | Port | Protocol | Purpose |
|---|---|---|---|---|
| Edge Node | Central Server | `8000` | TCP (HTTP) | API calls (`/count_increment`, `/heartbeat`) |
| Operator Browser | Central Server | `8000` | TCP (HTTP) | Dashboard website |
| Central Server | - | `6379` | TCP | Redis (internal, don't expose to public) |
| Central Server | - | `3306` | TCP | MySQL (internal, don't expose to public) |
| Edge Node | IP Camera | `554` | TCP (RTSP) | Camera video stream |
| Central Server | Edge Nodes | `2377` | TCP | Docker Swarm management |
| All Nodes | All Nodes | `7946` | TCP/UDP | Docker Swarm node discovery |

---

## 9. Troubleshooting

### Edge processor stuck in "Pending" state
```bash
docker service ps cement_dispatch_edge_processor_belt_01 --no-trunc
```
**Most common cause:** The node labels don't match. Double-check:
```bash
docker node inspect <node_id> --format '{{.Spec.Labels}}'
```
Should show `map[edge_id:node_01 gpu:true]`.

### Backend keeps restarting
Check logs:
```bash
docker service logs cement_dispatch_backend --tail 50
```
**Most common cause:** MySQL isn't ready yet. The backend will auto-retry on the next restart. Wait 30 seconds.

### Dashboard shows 0 bags even though camera is running
1. Make sure the operator clicked **"Start"** on the belt in the dashboard.
2. Check if the counting line (`COUNTING_LINE_Y`) is positioned correctly — it might be off-screen.
3. Check if the edge node is marked as **ONLINE** in the System Health tab.

### Camera feed not connecting
Test the RTSP URL directly on the edge node:
```bash
ffplay rtsp://admin:password@10.0.1.51/stream1
```
If this doesn't work, the issue is the camera network/credentials, not the software.

### Shift won't complete (stays "active" forever)
The shift finalizes only when **all 25 belts** are `idle`. Even one belt stuck in `paused` keeps it open. Check:
```bash
docker exec $(docker ps -q -f name=cement_dispatch_redis) redis-cli GET shift:active
```
If it returns `1`, find the non-idle belt:
```bash
for i in $(seq -w 1 25); do
  echo "belt_$i: $(docker exec $(docker ps -q -f name=cement_dispatch_redis) redis-cli GET belt_$i:status)"
done
```

### Edge node shows "OFFLINE" on the dashboard
The heartbeat is sent every 5 seconds; a belt is marked offline after 15 seconds of no heartbeat. Possible causes:
1. Edge container isn't running — check `docker service ps`.
2. Network firewall blocking port `8000` between edge node and central server.
3. `FASTAPI_BASE_URL` is wrong in the edge service environment — should be `http://backend:8000` when using Swarm's internal DNS.

---

## 10. Changing the Frontend Backend URL (Critical for Production)

The React dashboard has the backend URL **hardcoded** in `frontend/src/App.jsx` (line 10):
```javascript
const BACKEND_URL = 'http://127.0.0.1:8000';
```

For production, you **must** change this to the central server's actual IP before building the frontend Docker image:

1. Edit `frontend/src/App.jsx`:
   ```javascript
   const BACKEND_URL = 'http://10.0.1.10:8000';  // ← your central server IP
   ```

2. Rebuild the frontend image:
   ```bash
   cd frontend
   docker build -t cement-dispatch-frontend:latest .
   ```

3. Redeploy:
   ```bash
   cd infrastructure
   docker stack deploy -c docker-swarm-stack.yml cement_dispatch
   ```

> **Note:** This is listed as a known gap in the README. Ideally this should be a build-time env variable (`VITE_BACKEND_URL`), but it hasn't been implemented yet.

---

## 11. Files Not in Git (First-Time Setup)

The `.gitignore` excludes several files that are required to run the system. When cloning fresh, you need these:

| File | Where | What to Do |
|---|---|---|
| `best.pt` | `edge_node/` | **YOLOv8 model weights** trained on cement bag images. Without this, `belt_processor.py` crashes. Get from the ML team or retrain. This is the single most critical file. |
| `*.mp4` | `edge_node/` | Test videos for local dev. Not needed in production (cameras provide RTSP). |
| `.env` | `backend/`, `edge_node/` | Copy from `.env.example` and fill in your credentials (MySQL password, Redis host, etc.). |
| `node_modules/` | `frontend/` | Run `npm install` in the `frontend/` directory. |

---

## 12. Updating and Redeploying After Code Changes

### Updating the Backend
```bash
# Rebuild the image
docker build -t cement-dispatch-backend:latest ../backend

# Force Swarm to restart with the new image
docker service update --force cement_dispatch_backend
```

### Updating the Frontend
```bash
# Remember to update BACKEND_URL in App.jsx if needed
docker build -t cement-dispatch-frontend:latest ../frontend
docker service update --force cement_dispatch_frontend
```

### Updating an Edge Node
Because edge images are built locally on each worker node, you need to rebuild on each machine:
```bash
# On the edge node:
cd edge_node
docker build -t cement-dispatch-edge:latest .
```
Then from the **manager node**, force the service to pick up the new image:
```bash
docker service update --force cement_dispatch_edge_processor_belt_01
```

### Full Redeployment (Nuclear Option)
```bash
docker stack rm cement_dispatch
# Wait ~10 seconds for all services to stop
docker stack deploy -c docker-swarm-stack.yml cement_dispatch
```
MySQL data survives this because it's stored in a named Docker volume (`mysql_data`).

---

## 13. Redis Persistence Warning

By default, Redis runs **in-memory only** with no disk persistence. This means:
- If the Redis container restarts mid-shift, **all live counts, session states, and dedup sets are lost**.
- Completed sessions/shifts in MySQL are safe (they're written at "Stop" time).

For production, consider enabling Redis AOF (Append-Only File) persistence by creating a custom `redis.conf`:
```
appendonly yes
appendfsync everysec
```
And mounting it into the Redis container via `docker-swarm-stack.yml`:
```yaml
redis:
  image: redis:alpine
  command: redis-server /usr/local/etc/redis/redis.conf
  volumes:
    - ./redis.conf:/usr/local/etc/redis/redis.conf
    - redis_data:/data
```
This ensures that even if Redis crashes, it can recover the most recent state.
