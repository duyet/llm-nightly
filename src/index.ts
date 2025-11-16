#!/usr/bin/env bun

/**
 * LLM Nightly - Autonomous Overnight AI Scheduler
 *
 * Main entry point for the autonomous task execution system.
 */

import { AutonomousAgent } from "./agent/AutonomousAgent";
import { ConfigManager } from "./config/Config";
import { StatusDashboard } from "./monitoring/StatusDashboard";
import { HealthCheck } from "./monitoring/HealthCheck";
import { ReportGenerator } from "./reporting/ReportGenerator";
import { logger } from "./logging/Logger";

async function main() {
  logger.info("╔════════════════════════════════════════════════╗");
  logger.info("║         LLM Nightly v1.0.0                     ║");
  logger.info("║    Autonomous Overnight AI Scheduler          ║");
  logger.info("╚════════════════════════════════════════════════╝");
  logger.info("");

  // Load configuration
  const configManager = new ConfigManager();
  const config = await configManager.load();

  logger.info(`📁 Base Path: ${config.basePath}`);
  logger.info(`⚙️  Working Directory: ${config.workingDir}`);
  logger.info(`🤖 Autonomy Level: ${config.agent.autonomyLevel}`);
  logger.info(`💰 Token Budget: ${config.agent.tokenBudget.toLocaleString()}`);
  logger.info("");

  // Run health check
  logger.info("🏥 Running system health check...");
  const healthCheck = new HealthCheck({
    basePath: config.basePath,
    claudePath: config.claudePath,
    workingDir: config.workingDir,
  });

  const health = await healthCheck.runAll();
  logger.info("");
  logger.info(healthCheck.formatHealthReport(health));
  logger.info("");

  if (health.overall === "down" || health.overall === "critical") {
    logger.error(
      "❌ System health critical - please fix issues before starting",
    );
    logger.error("");
    logger.error("Failed Checks:");
    for (const check of health.checks.filter((c) => c.status === "fail")) {
      logger.error(`  - ${check.name}: ${check.message}`);
    }
    logger.error("");
    logger.error("Recommendations:");
    for (const rec of health.recommendations) {
      logger.error(`  - ${rec}`);
    }
    process.exit(1);
  }

  // Initialize agent
  logger.info("🚀 Initializing autonomous agent...");
  const agent = new AutonomousAgent({
    basePath: config.basePath,
    claudePath: config.claudePath,
    workingDir: config.workingDir,
    tokenBudget: config.agent.tokenBudget,
    maxConcurrentTasks: config.agent.maxConcurrentTasks,
    pollingIntervalSeconds: config.agent.pollingIntervalSeconds,
    autonomyLevel: config.agent.autonomyLevel,
    enableSelfTaskCreation: config.agent.enableSelfTaskCreation,
    maxSelfCreatedTasksPerCycle: config.agent.maxSelfCreatedTasksPerCycle,
  });

  // Setup signal handlers for graceful shutdown
  let shuttingDown = false;

  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;

    logger.info("");
    logger.info("🛑 Shutdown signal received...");

    // Stop agent
    await agent.stop();

    // Generate final report
    logger.info("📊 Generating final report...");
    const reportGenerator = new ReportGenerator(config.basePath);
    const status = agent.getStatus();
    const history = agent.getHistory();

    const summary = await reportGenerator.generateSummary(
      new Date(Date.now() - status.uptime * 1000),
      new Date(),
      history,
    );

    logger.info("");
    logger.info(reportGenerator.formatSummary(summary));
    logger.info("");

    // Export detailed report
    const detailedReport = await reportGenerator.generateDetailedReport(
      new Date(Date.now() - status.uptime * 1000),
      new Date(),
      history,
    );

    const reportPath = await reportGenerator.exportReport(
      detailedReport,
      "json",
    );

    logger.info(`📄 Detailed report saved: ${reportPath}`);
    logger.info("");
    logger.info("👋 Goodbye!");

    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  // Setup periodic status display
  const statusInterval = setInterval(() => {
    const dashboard = new StatusDashboard(agent);
    const dashboardOutput = dashboard.formatDashboard();

    console.clear();
    logger.info(dashboardOutput);
  }, 30000); // Update every 30 seconds

  // Start agent
  logger.info("");
  logger.info("✨ Agent starting in 3 seconds...");
  await new Promise((resolve) => setTimeout(resolve, 3000));

  try {
    // Show initial dashboard
    const dashboard = new StatusDashboard(agent);
    logger.info(dashboard.formatDashboard());
    logger.info("");

    // Start autonomous execution
    await agent.start();
  } catch (error) {
    logger.error("❌ Fatal error", error instanceof Error ? error : undefined);
    clearInterval(statusInterval);
    await shutdown();
  } finally {
    clearInterval(statusInterval);
  }
}

// Handle unhandled rejections
process.on("unhandledRejection", (reason, promise) => {
  logger.error("❌ Unhandled Rejection at", reason instanceof Error ? reason : undefined, { promise: String(promise), reason: String(reason) });
  process.exit(1);
});

// Handle uncaught exceptions
process.on("uncaughtException", (error) => {
  logger.error("❌ Uncaught Exception", error instanceof Error ? error : undefined);
  process.exit(1);
});

// Run
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    logger.error("❌ Fatal error", error instanceof Error ? error : undefined);
    process.exit(1);
  });
}

export { main };
