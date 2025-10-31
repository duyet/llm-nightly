import React from "react";
import { Box, Text } from "ink";

export interface LogEntry {
  timestamp: string;
  level: "info" | "warning" | "error" | "success";
  message: string;
}

export interface LogViewerProps {
  logs: LogEntry[];
  maxLines?: number;
}

export const LogViewer: React.FC<LogViewerProps> = ({ logs, maxLines = 10 }) => {
  const getLevelColor = (level: LogEntry["level"]) => {
    switch (level) {
      case "info":
        return "blue";
      case "warning":
        return "yellow";
      case "error":
        return "red";
      case "success":
        return "green";
      default:
        return "white";
    }
  };

  const getLevelIcon = (level: LogEntry["level"]) => {
    switch (level) {
      case "info":
        return "ℹ️";
      case "warning":
        return "⚠️";
      case "error":
        return "❌";
      case "success":
        return "✅";
      default:
        return "📝";
    }
  };

  const displayLogs = logs.slice(-maxLines);

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="magenta" paddingX={1} marginTop={1}>
      <Text bold underline>
        Activity Log
      </Text>
      <Box flexDirection="column" marginTop={1}>
        {displayLogs.length === 0 ? (
          <Text color="gray">No activity yet...</Text>
        ) : (
          displayLogs.map((log, index) => (
            <Box key={index}>
              <Text color="gray">{new Date(log.timestamp).toLocaleTimeString()}</Text>
              <Text> {getLevelIcon(log.level)} </Text>
              <Text color={getLevelColor(log.level)}>{log.message}</Text>
            </Box>
          ))
        )}
      </Box>
    </Box>
  );
};
