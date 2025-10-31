# Docker Deployment Guide

This guide covers deploying LLM Nightly using Docker and Docker Compose.

## Quick Start

### Using Docker Compose (Recommended)

```bash
# 1. Clone the repository
git clone <repository-url>
cd llm-nightly

# 2. Create environment file
cp .env.example .env
# Edit .env and add your CLAUDE_API_KEY

# 3. Start the container
docker-compose up -d

# 4. View logs
docker-compose logs -f llm-nightly

# 5. Stop the container
docker-compose down
```

### Using Docker Only

```bash
# Build the image
docker build -t llm-nightly:latest .

# Run the container
docker run -d \
  --name llm-nightly \
  -v llm-nightly-data:/data/.llm-nightly \
  -e CLAUDE_API_KEY=your_key_here \
  llm-nightly:latest
```

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `CLAUDE_API_KEY` | - | Claude API key (required) |
| `LLM_NIGHTLY_BASE_PATH` | `/data/.llm-nightly` | Data storage path |
| `NODE_ENV` | `production` | Environment mode |
| `LOG_LEVEL` | `info` | Logging level |
| `API_PORT` | `3000` | API server port |
| `WORKING_DIR` | `/workspace` | Working directory for tasks |

### Volumes

- `/data/.llm-nightly` - Persistent data (tasks, history, metrics, reports)
- `/workspace` - Optional working directory for task execution

### Resource Limits

Default limits in docker-compose.yml:
- CPU: 2 cores max, 1 core reserved
- Memory: 2GB max, 512MB reserved

Adjust based on your workload:

```yaml
deploy:
  resources:
    limits:
      cpus: '4'
      memory: 4G
    reservations:
      cpus: '2'
      memory: 1G
```

## Production Deployment

### 1. Multi-Stage Build

The Dockerfile uses multi-stage builds for optimization:

```
Stage 1: Install production dependencies only
Stage 2: Build application with dev dependencies
Stage 3: Copy built artifacts and production deps to slim runtime image
```

Final image size: ~150-200MB

### 2. Health Checks

Container includes health checks that run every 30s:

```bash
# Check health status
docker inspect --format='{{.State.Health.Status}}' llm-nightly

# View health check logs
docker inspect --format='{{range .State.Health.Log}}{{.Output}}{{end}}' llm-nightly
```

Health check verifies:
- Application is running
- System health checks pass
- Critical services available

### 3. Logging

Logs are configured with rotation:

```yaml
logging:
  driver: "json-file"
  options:
    max-size: "10m"
    max-file: "3"
```

View logs:

```bash
# Follow logs
docker-compose logs -f

# Last 100 lines
docker-compose logs --tail=100

# Specific service
docker-compose logs -f llm-nightly
```

### 4. Persistent Data

All task data is stored in Docker volumes:

```bash
# List volumes
docker volume ls

# Inspect volume
docker volume inspect llm-nightly_llm-nightly-data

# Backup volume
docker run --rm \
  -v llm-nightly_llm-nightly-data:/data \
  -v $(pwd)/backup:/backup \
  alpine tar czf /backup/llm-nightly-backup.tar.gz /data

# Restore volume
docker run --rm \
  -v llm-nightly_llm-nightly-data:/data \
  -v $(pwd)/backup:/backup \
  alpine sh -c "cd /data && tar xzf /backup/llm-nightly-backup.tar.gz --strip 1"
```

## Development with Docker

### Hot Reload Development

```bash
# Use development docker-compose override
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up

# Mount local source code
volumes:
  - ./src:/app/src:ro
  - ./tests:/app/tests:ro
```

### Running Tests

```bash
# Run tests in container
docker-compose exec llm-nightly bun test

# Run with coverage
docker-compose exec llm-nightly bun test --coverage

# Run specific test file
docker-compose exec llm-nightly bun test tests/unit/agent/ErrorRecovery.test.ts
```

### Shell Access

```bash
# Interactive shell
docker-compose exec llm-nightly /bin/sh

# Run commands
docker-compose exec llm-nightly bun run src/index.ts --help
```

## Troubleshooting

### Container Won't Start

```bash
# Check logs
docker-compose logs llm-nightly

# Check health
docker inspect llm-nightly | grep Health -A 10

# Verify environment
docker-compose config
```

### Permission Issues

```bash
# Fix volume permissions
docker-compose exec --user root llm-nightly chown -R llmnightly:llmnightly /data
```

### High Memory Usage

```bash
# Check container stats
docker stats llm-nightly

# Adjust memory limits in docker-compose.yml
deploy:
  resources:
    limits:
      memory: 1G
```

### Network Issues

```bash
# Inspect network
docker network inspect llm-nightly_llm-nightly-network

# Recreate network
docker-compose down
docker network prune
docker-compose up -d
```

## Security Best Practices

1. **Non-root User**: Container runs as `llmnightly` user (UID 1000)
2. **Read-only Filesystem**: Mount sensitive configs as read-only
3. **Secrets Management**: Use Docker secrets or env files
4. **Network Isolation**: Use custom bridge network
5. **Resource Limits**: Prevent resource exhaustion
6. **Regular Updates**: Keep base image updated

```bash
# Update base image
docker pull oven/bun:1-slim
docker-compose build --no-cache
docker-compose up -d
```

## Monitoring

### Container Metrics

```bash
# Real-time stats
docker stats

# Formatted output
docker stats --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}"
```

### Integration with Monitoring Tools

Future releases will include:
- Prometheus metrics endpoint
- Grafana dashboards
- Log aggregation with ELK stack
- Alert manager integration

## CI/CD Integration

### GitHub Actions

```yaml
- name: Build Docker image
  run: docker build -t llm-nightly:${{ github.sha }} .

- name: Push to registry
  run: |
    echo ${{ secrets.DOCKER_PASSWORD }} | docker login -u ${{ secrets.DOCKER_USERNAME }} --password-stdin
    docker push llm-nightly:${{ github.sha }}
```

### Kubernetes Deployment

See [KUBERNETES.md](./KUBERNETES.md) for Kubernetes deployment guide (coming soon).

## Cloud Platforms

### AWS ECS

```bash
# Create ECR repository
aws ecr create-repository --repository-name llm-nightly

# Build and push
docker build -t llm-nightly .
docker tag llm-nightly:latest ${ECR_REGISTRY}/llm-nightly:latest
docker push ${ECR_REGISTRY}/llm-nightly:latest
```

### Google Cloud Run

```bash
# Build for Cloud Run
gcloud builds submit --tag gcr.io/${PROJECT_ID}/llm-nightly

# Deploy
gcloud run deploy llm-nightly \
  --image gcr.io/${PROJECT_ID}/llm-nightly \
  --platform managed \
  --region us-central1
```

### Azure Container Instances

```bash
# Create container group
az container create \
  --resource-group myResourceGroup \
  --name llm-nightly \
  --image llmnightly/llm-nightly:latest \
  --dns-name-label llm-nightly-unique \
  --ports 3000
```

## Support

For issues or questions:
- GitHub Issues: [repository]/issues
- Docker Hub: docker.io/llmnightly/llm-nightly
- Documentation: [repository]/docs

---

**Happy Deploying! 🐳**
