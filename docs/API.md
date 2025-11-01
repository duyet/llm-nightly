# LLM Nightly API Documentation

**Version**: 1.0.0
**Base URL**: `http://localhost:3000` (configurable)

## Table of Contents
- [Authentication](#authentication)
- [Response Format](#response-format)
- [Endpoints](#endpoints)
  - [Health](#health)
  - [Tasks](#tasks)
  - [Metrics](#metrics)
  - [Logs](#logs)
  - [History](#history)
- [Error Handling](#error-handling)
- [Rate Limiting](#rate-limiting)
- [Examples](#examples)

## Authentication

The API supports optional bearer token authentication.

### Configuration
Set `authToken` in API server configuration to enable authentication:

```typescript
const apiServer = new ApiServer({
  authToken: "your-secret-token",
  // ...
});
```

### Usage
Include the token in the `Authorization` header:

```bash
curl -H "Authorization: Bearer your-secret-token" http://localhost:3000/health
```

Without authentication, all endpoints are publicly accessible.

## Response Format

All API responses follow a consistent JSON format:

```json
{
  "success": true,
  "data": { /* response data */ },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

### Success Response
```json
{
  "success": true,
  "data": { /* response payload */ },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

### Error Response
```json
{
  "success": false,
  "error": "Error message describing what went wrong",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Endpoints

### Health

#### GET /health

Check system health status.

**Response Codes:**
- `200` - System is healthy or degraded
- `503` - System is down or critical

**Response Body:**
```json
{
  "success": true,
  "data": {
    "overall": "healthy",
    "checks": [
      {
        "name": "Storage Access",
        "status": "pass",
        "message": "Directory is writable"
      },
      {
        "name": "Claude API",
        "status": "pass",
        "message": "API key configured"
      }
    ],
    "recommendations": []
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

**Health Status Values:**
- `healthy` - All checks passing
- `degraded` - Some non-critical issues
- `down` - Critical systems unavailable
- `critical` - System unusable

**Example:**
```bash
curl http://localhost:3000/health
```

---

### Tasks

#### GET /tasks

List all tasks with optional filtering.

**Query Parameters:**
- `status` (optional) - Filter by status: `open`, `in-progress`, `done`, `blocked`
- `priority` (optional) - Filter by priority: `1` (critical) to `5` (minimal)
- `tag` (optional) - Filter by tag name

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "config": {
        "id": "task-1234567890-api",
        "title": "Example Task",
        "priority": 3,
        "autonomyLevel": "semi",
        "estimatedTokens": 5000,
        "dependencies": [],
        "tags": ["example", "api"],
        "createdAt": "2024-01-01T00:00:00.000Z",
        "createdBy": "human",
        "maxRetries": 3,
        "timeout": 300
      },
      "prompt": "Task prompt text",
      "status": "open",
      "attempts": 0
    }
  ],
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

**Examples:**
```bash
# Get all tasks
curl http://localhost:3000/tasks

# Get only open tasks
curl http://localhost:3000/tasks?status=open

# Get high priority tasks
curl http://localhost:3000/tasks?priority=2

# Get tasks with specific tag
curl http://localhost:3000/tasks?tag=urgent
```

---

#### GET /tasks/:id

Get a specific task by ID.

**Path Parameters:**
- `id` - Task ID (e.g., `task-1234567890-api`)

**Response Codes:**
- `200` - Task found
- `404` - Task not found

**Response:**
```json
{
  "success": true,
  "data": {
    "config": { /* task config */ },
    "prompt": "Task prompt text",
    "context": "Optional context",
    "status": "open",
    "attempts": 0
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

**Example:**
```bash
curl http://localhost:3000/tasks/task-1234567890-api
```

---

#### POST /tasks

Create a new task.

**Request Body:**
```json
{
  "title": "Task Title",
  "prompt": "What the task should do",
  "priority": "high",
  "tags": ["example"],
  "context": "Optional additional context",
  "autonomyLevel": "semi",
  "estimatedTokens": 5000,
  "maxRetries": 3,
  "timeout": 300
}
```

**Required Fields:**
- `title` - Task title (5-200 characters)
- `prompt` - Task description

**Optional Fields:**
- `priority` - `critical`, `high`, `normal` (default), `low`, `minimal`
- `tags` - Array of tag strings
- `context` - Additional context information
- `autonomyLevel` - `full`, `semi` (default), `manual`
- `estimatedTokens` - Estimated token count (default: 5000)
- `dependencies` - Array of task IDs this depends on
- `maxRetries` - Maximum retry attempts (default: 3)
- `timeout` - Timeout in seconds (default: 300)

**Response Codes:**
- `201` - Task created successfully
- `400` - Invalid request (missing required fields)

**Response:**
```json
{
  "success": true,
  "data": {
    "config": { /* created task config */ },
    "prompt": "Task prompt",
    "status": "open",
    "attempts": 0
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

**Example:**
```bash
curl -X POST http://localhost:3000/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Example Task",
    "prompt": "Do something interesting",
    "priority": "high",
    "tags": ["example"]
  }'
```

---

#### POST /tasks/:id/execute

Request task execution (queued for scheduler).

**Path Parameters:**
- `id` - Task ID

**Response Codes:**
- `200` - Execution request acknowledged
- `404` - Task not found

**Response:**
```json
{
  "success": true,
  "data": {
    "message": "Task execution request acknowledged. Task will be processed by the scheduler.",
    "taskId": "task-1234567890-api",
    "currentStatus": "open"
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

**Example:**
```bash
curl -X POST http://localhost:3000/tasks/task-1234567890-api/execute
```

---

### Metrics

#### GET /metrics

Get system metrics and statistics.

**Response:**
```json
{
  "success": true,
  "data": {
    "tasks": {
      "total": 10,
      "byStatus": {
        "open": 3,
        "in-progress": 1,
        "done": 5,
        "blocked": 1
      },
      "byPriority": {
        "1": 2,
        "2": 3,
        "3": 4,
        "4": 1,
        "5": 0
      }
    },
    "logs": {
      "total": 142,
      "byLevel": {
        "debug": 20,
        "info": 80,
        "warn": 30,
        "error": 10,
        "fatal": 2
      }
    },
    "uptime": 3600.5,
    "memory": {
      "rss": 52428800,
      "heapTotal": 20971520,
      "heapUsed": 15728640,
      "external": 1048576,
      "arrayBuffers": 524288
    }
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

**Example:**
```bash
curl http://localhost:3000/metrics
```

---

### Logs

#### GET /logs

Query log entries with filters.

**Query Parameters:**
- `level` (optional) - Filter by level: `debug`, `info`, `warn`, `error`, `fatal`
- `search` (optional) - Search term in message text
- `taskId` (optional) - Filter by task ID
- `limit` (optional) - Maximum entries to return (default: 100)

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "timestamp": "2024-01-01T00:00:00.000Z",
      "level": "info",
      "message": "Task created successfully",
      "taskId": "task-1234567890-api",
      "context": {
        "userId": "user-123"
      }
    }
  ],
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

**Examples:**
```bash
# Get recent logs
curl http://localhost:3000/logs

# Get error logs only
curl http://localhost:3000/logs?level=error

# Search logs
curl http://localhost:3000/logs?search=authentication

# Get logs for specific task
curl http://localhost:3000/logs?taskId=task-1234567890-api

# Limit results
curl http://localhost:3000/logs?limit=50
```

---

### History

#### GET /history

Get execution history for a task.

**Query Parameters:**
- `taskId` (required) - Task ID to get history for

**Response Codes:**
- `200` - History retrieved
- `400` - Missing taskId parameter

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "taskId": "task-1234567890-api",
      "timestamp": "2024-01-01T00:00:00.000Z",
      "status": "success",
      "output": "Task completed successfully",
      "tokensUsed": 1234,
      "duration": 5000,
      "error": null
    }
  ],
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

**Example:**
```bash
curl http://localhost:3000/history?taskId=task-1234567890-api
```

---

## Error Handling

### HTTP Status Codes

| Code | Meaning | Description |
|------|---------|-------------|
| 200 | OK | Request successful |
| 201 | Created | Resource created successfully |
| 204 | No Content | Request successful, no content to return |
| 400 | Bad Request | Invalid request parameters |
| 401 | Unauthorized | Missing or invalid authentication |
| 404 | Not Found | Resource not found |
| 500 | Internal Server Error | Server error occurred |
| 503 | Service Unavailable | System health critical |

### Error Response Examples

**Missing Required Fields:**
```json
{
  "success": false,
  "error": "Missing required fields: title, prompt",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

**Resource Not Found:**
```json
{
  "success": false,
  "error": "Task not found",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

**Authentication Error:**
```json
{
  "success": false,
  "error": "Unauthorized",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Rate Limiting

Currently, no rate limiting is enforced. Future versions will include:
- Per-IP rate limits
- Per-token rate limits
- Rate limit headers (`X-RateLimit-Limit`, `X-RateLimit-Remaining`)

## CORS

CORS is enabled by default for all origins. Configure with:

```typescript
const apiServer = new ApiServer({
  enableCors: true, // Enable CORS
  // ...
});
```

**CORS Headers:**
- `Access-Control-Allow-Origin: *`
- `Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS`
- `Access-Control-Allow-Headers: Content-Type, Authorization`

## Examples

### Complete Workflow Example

```bash
# 1. Check system health
curl http://localhost:3000/health

# 2. Create a new task
TASK_ID=$(curl -X POST http://localhost:3000/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Generate Report",
    "prompt": "Generate a monthly analytics report",
    "priority": "high",
    "tags": ["report", "analytics"]
  }' | jq -r '.data.config.id')

# 3. Request task execution
curl -X POST http://localhost:3000/tasks/$TASK_ID/execute

# 4. Check task status
curl http://localhost:3000/tasks/$TASK_ID

# 5. View logs for the task
curl http://localhost:3000/logs?taskId=$TASK_ID

# 6. Check execution history
curl http://localhost:3000/history?taskId=$TASK_ID

# 7. View system metrics
curl http://localhost:3000/metrics
```

### JavaScript/TypeScript Example

```typescript
import fetch from 'node-fetch';

const API_BASE = 'http://localhost:3000';

// Create a task
const response = await fetch(`${API_BASE}/tasks`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer your-token' // if auth enabled
  },
  body: JSON.stringify({
    title: 'Example Task',
    prompt: 'Do something',
    priority: 'high'
  })
});

const result = await response.json();
console.log('Task created:', result.data.config.id);

// Get task status
const taskResponse = await fetch(`${API_BASE}/tasks/${result.data.config.id}`);
const task = await taskResponse.json();
console.log('Task status:', task.data.status);
```

### Python Example

```python
import requests

API_BASE = 'http://localhost:3000'

# Create a task
response = requests.post(
    f'{API_BASE}/tasks',
    json={
        'title': 'Example Task',
        'prompt': 'Do something',
        'priority': 'high'
    },
    headers={'Authorization': 'Bearer your-token'}  # if auth enabled
)

task = response.json()
task_id = task['data']['config']['id']
print(f'Task created: {task_id}')

# Execute task
execute_response = requests.post(f'{API_BASE}/tasks/{task_id}/execute')
print('Execution requested:', execute_response.json())
```

---

## Support

For issues or questions:
- GitHub Issues: [repository]/issues
- Documentation: [repository]/docs
- Docker Guide: [DOCKER.md](./DOCKER.md)

**Happy Building! 🚀**
