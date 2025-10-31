#!/usr/bin/env bun
import React, { useState, useEffect } from "react";
import { render, Box } from "ink";
import { Header } from "./ui/components/Header";
import { StatusBar } from "./ui/components/StatusBar";
import { LogViewer, type LogEntry } from "./ui/components/LogViewer";

function App() {
  const [status, setStatus] = useState<"idle" | "running" | "error">("idle");
  const [logs, setLogs] = useState<LogEntry[]>([
    {
      timestamp: new Date().toISOString(),
      level: "success",
      message: "LLM Nightly started successfully",
    },
    {
      timestamp: new Date().toISOString(),
      level: "info",
      message: "Phase 1 Foundation components initialized",
    },
  ]);

  const [stats, setStats] = useState({
    tasksOpen: 0,
    tasksInProgress: 0,
    tasksDone: 0,
    tokensUsed: 0,
    tokenBudget: 100000,
  });

  useEffect(() => {
    // Add welcome log entries
    const timer = setTimeout(() => {
      setLogs((prev) => [
        ...prev,
        {
          timestamp: new Date().toISOString(),
          level: "info",
          message: "✅ TaskManager ready",
        },
        {
          timestamp: new Date().toISOString(),
          level: "info",
          message: "✅ FileStorage ready",
        },
        {
          timestamp: new Date().toISOString(),
          level: "info",
          message: "✅ MemoryManager ready",
        },
        {
          timestamp: new Date().toISOString(),
          level: "info",
          message: "✅ ClaudeExecutor ready",
        },
        {
          timestamp: new Date().toISOString(),
          level: "success",
          message: "System ready for autonomous operation",
        },
      ]);
    }, 1000);

    return () => clearTimeout(timer);
  }, []);

  return (
    <Box flexDirection="column" padding={1}>
      <Header version="v0.1.0" status={status} />
      <StatusBar
        tasksOpen={stats.tasksOpen}
        tasksInProgress={stats.tasksInProgress}
        tasksDone={stats.tasksDone}
        tokensUsed={stats.tokensUsed}
        tokenBudget={stats.tokenBudget}
      />
      <LogViewer logs={logs} maxLines={15} />
    </Box>
  );
}

render(<App />);
