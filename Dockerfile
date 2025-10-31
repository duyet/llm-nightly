# Multi-stage Dockerfile for LLM Nightly
# Stage 1: Dependencies
FROM oven/bun:1 as dependencies

WORKDIR /app

# Copy package files
COPY package.json bun.lockb* ./

# Install dependencies
RUN bun install --frozen-lockfile --production

# Stage 2: Build
FROM oven/bun:1 as builder

WORKDIR /app

# Copy package files
COPY package.json bun.lockb* ./

# Install all dependencies (including dev)
RUN bun install --frozen-lockfile

# Copy source code
COPY . .

# Build application
RUN bun run build

# Stage 3: Runtime
FROM oven/bun:1-slim as runtime

# Install Claude Code CLI (if publicly available)
# RUN curl -fsSL https://claude.ai/install.sh | sh

# Create non-root user
RUN groupadd -r llmnightly && useradd -r -g llmnightly llmnightly

# Set working directory
WORKDIR /app

# Copy built application from builder
COPY --from=builder --chown=llmnightly:llmnightly /app/dist ./dist
COPY --from=builder --chown=llmnightly:llmnightly /app/package.json ./

# Copy production dependencies from dependencies stage
COPY --from=dependencies --chown=llmnightly:llmnightly /app/node_modules ./node_modules

# Create directories for persistent data
RUN mkdir -p /data/.llm-nightly && \
    chown -R llmnightly:llmnightly /data

# Switch to non-root user
USER llmnightly

# Environment variables
ENV NODE_ENV=production \
    HOME=/data \
    LLM_NIGHTLY_BASE_PATH=/data/.llm-nightly

# Expose ports (if API server is added)
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD bun run -e 'const h = await import("./dist/monitoring/HealthCheck.js"); \
    const check = new h.HealthCheck({ basePath: process.env.LLM_NIGHTLY_BASE_PATH, claudePath: "claude", workingDir: "/app" }); \
    const result = await check.runAll(); \
    process.exit(result.overall === "healthy" || result.overall === "degraded" ? 0 : 1)'

# Volume for persistent data
VOLUME ["/data/.llm-nightly"]

# Entry point
ENTRYPOINT ["bun", "run", "dist/index.js"]

# Default command
CMD []
