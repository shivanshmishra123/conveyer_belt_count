# Use the official Ultralytics base image (includes PyTorch, OpenCV, CUDA, and YOLOv8)
FROM ultralytics/ultralytics:latest

# Set working directory inside container
WORKDIR /app

# Copy and install extra Python dependencies (pinned for reproducibility)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy source code, configurations, and weights
COPY belt_processor.py .
COPY best.pt .
COPY config.json .

# Set environment variable defaults
ENV BELT_CONFIG_PATH=config.json

# Run the python processor script on startup
CMD ["python", "belt_processor.py"]
