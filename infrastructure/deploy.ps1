<#
.SYNOPSIS
Initializes Docker Swarm and deploys the Cement Dispatch system.

.DESCRIPTION
This script is intended for use on the Windows-based Manager node. It checks for Docker,
initializes the Swarm if necessary, builds the backend and frontend local images,
and deploys the stack defined in docker-swarm-stack.yml.

.EXAMPLE
.\deploy.ps1
#>

$ErrorActionPreference = "Stop"

Write-Host "🚀 Starting Cement Dispatch Deployment..." -ForegroundColor Cyan

# 1. Prerequisite Checks
if (-not (Get-Command "docker" -ErrorAction SilentlyContinue)) {
    Write-Host "❌ ERROR: Docker is not installed. Please install Docker Desktop first." -ForegroundColor Red
    exit 1
}

$dockerInfo = docker info 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ ERROR: Docker daemon is not running. Please start Docker Desktop." -ForegroundColor Red
    exit 1
}

# 2. Swarm Initialization
$swarmStatus = docker info --format '{{.Swarm.LocalNodeState}}'
if ($swarmStatus -ne "active") {
    Write-Host "⚙️ Initializing Docker Swarm..." -ForegroundColor Yellow
    docker swarm init
    Write-Host "✅ Swarm initialized successfully." -ForegroundColor Green
} else {
    Write-Host "✅ Node is already part of a Docker Swarm." -ForegroundColor Green
}

# 3. Build Local Images
Write-Host "🔨 Building Docker images (this may take a few minutes)..." -ForegroundColor Cyan

Write-Host "   -> Building Backend Image..." -ForegroundColor Yellow
docker build -t cement-dispatch-backend:latest ..\backend

Write-Host "   -> Building Frontend Image..." -ForegroundColor Yellow
docker build -t cement-dispatch-frontend:latest ..\frontend

Write-Host "✅ Images built successfully." -ForegroundColor Green

# 4. Deploy Stack
Write-Host "📦 Deploying stack 'cement_dispatch'..." -ForegroundColor Cyan
docker stack deploy -c docker-swarm-stack.yml cement_dispatch

Write-Host ""
Write-Host "🎉 Deployment Complete!" -ForegroundColor Green
Write-Host "------------------------------------------------------------"
Write-Host "To check the status of your services, run:"
Write-Host "   docker service ls" -ForegroundColor Yellow
Write-Host ""
Write-Host "To view logs for the backend, run:"
Write-Host "   docker service logs cement_dispatch_backend -f" -ForegroundColor Yellow
Write-Host "------------------------------------------------------------"
