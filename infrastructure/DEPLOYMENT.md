# Cement Dispatch — System Operator Guide

This guide covers how to deploy, configure, and maintain the Cement Dispatch multi-node architecture using Docker Swarm.

---

## 1. Architecture Overview

The system runs on a **hybrid edge-cloud architecture**:
- **Manager Node (Central Server):** Runs the Frontend Dashboard, FastAPI Backend, Redis (in-memory state), and MySQL (persistent storage).
- **Worker Nodes (Edge Devices):** Physical machines installed near the conveyor belts. These nodes require GPUs and run the Computer Vision pipeline (`belt_processor.py`).

---

## 2. Prerequisites

### On the Manager Node (Central Server):
- Docker installed (`Docker Desktop` for Windows, or `Docker Engine` for Linux).

### On the Worker Nodes (Edge Devices):
- **Linux OS** (Ubuntu 22.04 recommended)
- **NVIDIA GPU** installed with proper drivers.
- **Docker Engine** installed.
- **NVIDIA Container Toolkit** installed (required to pass GPU access into the Docker container).

---

## 3. Step-by-Step Deployment (Central Server)

1. Open a terminal (PowerShell for Windows, Bash for Linux) on the Manager Node.
2. Navigate to the `infrastructure` directory:
   ```bash
   cd cement-dispatch/infrastructure
   ```
3. Run the deployment script:
   - **Windows:** `.\deploy.ps1`
   - **Linux:** `./deploy.sh`

This script will automatically:
- Initialize the server as the Swarm Manager.
- Build the local Docker images for the backend and frontend.
- Deploy the central stack components (MySQL, Redis, Backend, Frontend).

> [!NOTE]
> The edge node processors will **not** start automatically until worker nodes are added to the swarm and correctly labeled.

---

## 4. Attaching Edge Nodes (Worker Nodes)

For each physical edge device, you must join it to the Swarm cluster.

### Step 4.1: Get the Join Token
On the **Manager Node**, run:
```bash
docker swarm join-token worker
```
This will output a command like:
`docker swarm join --token SWMTKN-1-... 192.168.1.100:2377`

### Step 4.2: Join the Worker Node
Log into your **Edge Device** and run the command generated in the previous step.

### Step 4.3: Build the Edge Image
Because the system currently uses local images, you must build the edge processor image directly on the edge node.
Copy the `edge_node/` folder to the Edge Device and run:
```bash
cd edge_node
docker build -t cement-dispatch-edge:latest .
```

> [!TIP]
> If your company uses a private Docker Registry (e.g., Nexus or Harbor), you can push `cement-dispatch-edge` to the registry from the manager node, and worker nodes will automatically pull it.

---

## 5. Labeling Edge Nodes for Placement

The `docker-swarm-stack.yml` file uses **Placement Constraints** to ensure the heavy CV workloads only run on the correct Edge Devices. 

For example, `edge_processor_belt_01` requires a node labeled `gpu=true` and `edge_id=node_01`.

On the **Manager Node**, list your connected nodes:
```bash
docker node ls
```

Add the required labels to the specific worker node (replace `<node_id>` with the ID from the previous command):
```bash
docker node update --label-add gpu=true <node_id>
docker node update --label-add edge_id=node_01 <node_id>
```

As soon as the labels are applied, Swarm will automatically schedule the pending `edge_processor_belt_01` container onto that physical edge node.

---

## 6. Configuration (.env)

All sensitive configurations should be managed via environment variables.

- **Central Server:** Modify `backend/.env` for MySQL passwords, Redis endpoints, etc.
- **Edge Node:** The `edge_processor` configuration (RTSP URL, camera mapping, backend IP) is passed via the `environment` block in `docker-swarm-stack.yml`. 

> [!WARNING]
> Before going to production, ensure you update the `VIDEO_SOURCE` in `docker-swarm-stack.yml` from local video files to the actual RTSP camera streams (e.g., `rtsp://admin:password@10.0.1.51/stream1`).

---

## 7. Useful Operational Commands

Run these on the **Manager Node**:

**Check overall stack status:**
```bash
docker stack services cement_dispatch
```

**Check why a service isn't starting (e.g. pending state):**
```bash
docker service ps cement_dispatch_edge_processor_belt_01 --no-trunc
```

**View logs for the backend:**
```bash
docker service logs cement_dispatch_backend -f
```

**Remove the stack (Stops all services gracefully):**
```bash
docker stack rm cement_dispatch
```
