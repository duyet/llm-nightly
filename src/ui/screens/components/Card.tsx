import React from "react";
import { Box, Text } from "ink";
import type { Task } from "@/types";

export interface CardProps {
  task: Task;
  selected: boolean;
  onClick?: () => void;
}

export const Card: React.FC<CardProps> = ({ task, selected }) => {
  const getPriorityIcon = (priority: number): string => {
    switch (priority) {
      case 1:
        return "⚡";
      case 2:
        return "🔥";
      case 3:
        return "📌";
      case 4:
        return "📋";
      case 5:
        return "📝";
      default:
        return "❓";
    }
  };

  const getPriorityColor = (priority: number): string => {
    switch (priority) {
      case 1:
        return "red";
      case 2:
        return "yellow";
      case 3:
        return "blue";
      case 4:
        return "gray";
      case 5:
        return "gray";
      default:
        return "white";
    }
  };

  const getStatusIcon = (status: Task["status"]): string => {
    switch (status) {
      case "open":
        return "📋";
      case "in-progress":
        return "🔄";
      case "done":
        return "✅";
      case "blocked":
        return "🚧";
      case "cancelled":
        return "❌";
      default:
        return "❓";
    }
  };

  const backgroundColor = selected ? "blue" : undefined;
  const taskIdShort = task.config.id.split("-").slice(0, 2).join("-");

  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      borderColor={selected ? "cyan" : "gray"}
      paddingX={1}
    >
      {/* Card header */}
      <Box justifyContent="space-between">
        <Text color={getPriorityColor(task.config.priority)}>
          {getPriorityIcon(task.config.priority)} {taskIdShort}
        </Text>
        <Text color="gray">{getStatusIcon(task.status)}</Text>
      </Box>

      {/* Card title */}
      <Box marginY={0}>
        <Text bold>{task.config.title.substring(0, 25)}{task.config.title.length > 25 ? "..." : ""}</Text>
      </Box>

      {/* Card metadata */}
      <Box justifyContent="space-between">
        <Text color="gray" dimColor>
          {(task.config.estimatedTokens / 1000).toFixed(1)}K tokens
        </Text>
        {task.config.dependencies.length > 0 && (
          <Text color="yellow">🔗 {task.config.dependencies.length}</Text>
        )}
      </Box>

      {/* Tags */}
      {task.config.tags.length > 0 && (
        <Box marginTop={0}>
          <Text color="magenta" dimColor>
            {task.config.tags.slice(0, 3).join(", ")}
            {task.config.tags.length > 3 ? "..." : ""}
          </Text>
        </Box>
      )}
    </Box>
  );
};
