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

async function main() {
  console.log("╔════════════════════════════════════════════════╗");
  console.log("║         LLM Nightly v1.0.0                     ║");
  console.log("║    Autonomous Overnight AI Scheduler          ║");
  console.log("╚════════════════════════════════════════════════╝");
  console.log("");

  // Load configuration
  const configManager = new ConfigManager();
  const config = await configManager.load();

  console.log(`📁 Base Path: ${config.basePath}`);
  console.log(`⚙️  Working Directory: ${config.workingDir}`);
  console.log(`🤖 Autonomy Level: ${config.agent.autonomyLevel}`);
  console.log(`💰 Token Budget: ${config.agent.tokenBudget.toLocaleString()}`);
  console.log("");

  // Run health check
  console.log("🏥 Running system health check...");
  const healthCheck = new HealthCheck({
    basePath: config.basePath,
    claudePath: config.claudePath,
    workingDir: config.workingDir,
  });

  const health = await healthCheck.runAll();
  console.log("");
  console.log(healthCheck.formatHealthReport(health));
  console.log("");

  if (health.overall === "down" || health.overall === "critical") {
    console.error(
      "❌ System health critical - please fix issues before starting",
    );
    console.error("");
    console.error("Failed Checks:");
    for (const check of health.checks.filter((c) => c.status === "fail")) {
      console.error(`  - ${check.name}: ${check.message}`);
    }
    console.error("");
    console.error("Recommendations:");
    for (const rec of health.recommendations) {
      console.error(`  - ${rec}`);
    }
    process.exit(1);
  }

  // Initialize agent
  console.log("🚀 Initializing autonomous agent...");
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

    console.log("");
    console.log("🛑 Shutdown signal received...");

    // Stop agent
    await agent.stop();

    // Generate final report
    console.log("📊 Generating final report...");
    const reportGenerator = new ReportGenerator(config.basePath);
    const status = agent.getStatus();
    const history = agent.getHistory();

    const summary = await reportGenerator.generateSummary(
      new Date(Date.now() - status.uptime * 1000),
      new Date(),
      history,
    );

    console.log("");
    console.log(reportGenerator.formatSummary(summary));
    console.log("");

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

    console.log(`📄 Detailed report saved: ${reportPath}`);
    console.log("");
    console.log("👋 Goodbye!");

    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  // Setup periodic status display
  const statusInterval = setInterval(() => {
    const dashboard = new StatusDashboard(agent);
    const dashboardOutput = dashboard.formatDashboard();

    console.clear();
    console.log(dashboardOutput);
  }, 30000); // Update every 30 seconds

  // Start agent
  console.log("");
  console.log("✨ Agent starting in 3 seconds...");
  await new Promise((resolve) => setTimeout(resolve, 3000));

  try {
    // Show initial dashboard
    const dashboard = new StatusDashboard(agent);
    console.log(dashboard.formatDashboard());
    console.log("");

    // Start autonomous execution
    await agent.start();
  } catch (error) {
    console.error("❌ Fatal error:", error);
    clearInterval(statusInterval);
    await shutdown();
  } finally {
    clearInterval(statusInterval);
  }
}

// Handle unhandled rejections
process.on("unhandledRejection", (reason, promise) => {
  console.error("❌ Unhandled Rejection at:", promise, "reason:", reason);
  process.exit(1);
});

// Handle uncaught exceptions
process.on("uncaughtException", (error) => {
  console.error("❌ Uncaught Exception:", error);
  process.exit(1);
});

// Run
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error("❌ Fatal error:", error);
    process.exit(1);
  });
}

export { main };
