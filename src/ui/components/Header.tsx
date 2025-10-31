import React from "react";
import { Box, Text } from "ink";

export interface HeaderProps {
  version: string;
  status: "idle" | "running" | "error";
}

export const Header: React.FC<HeaderProps> = ({ version, status }) => {
  const getStatusColor = () => {
    switch (status) {
      case "idle":
        return "gray";
      case "running":
        return "green";
      case "error":
        return "red";
      default:
        return "white";
    }
  };

  const getStatusIcon = () => {
    switch (status) {
      case "idle":
        return "💤";
      case "running":
        return "⚡";
      case "error":
        return "❌";
      default:
        return "❓";
    }
  };

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1}>
      <Box justifyContent="space-between">
        <Text bold color="cyan">
          🌙 LLM Nightly {version}
        </Text>
        <Text color={getStatusColor()}>
          {getStatusIcon()} {status.toUpperCase()}
        </Text>
      </Box>
    </Box>
  );
};
