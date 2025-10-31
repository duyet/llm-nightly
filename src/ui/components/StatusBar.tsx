import React from "react";
import { Box, Text } from "ink";

export interface StatusBarProps {
  tasksOpen: number;
  tasksInProgress: number;
  tasksDone: number;
  tokensUsed: number;
  tokenBudget: number;
}

export const StatusBar: React.FC<StatusBarProps> = ({
  tasksOpen,
  tasksInProgress,
  tasksDone,
  tokensUsed,
  tokenBudget,
}) => {
  const tokenPercentage = (tokensUsed / tokenBudget) * 100;
  const getTokenColor = () => {
    if (tokenPercentage >= 90) return "red";
    if (tokenPercentage >= 75) return "yellow";
    return "green";
  };

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="blue" paddingX={1} marginTop={1}>
      <Text bold underline>
        Status
      </Text>
      <Box marginTop={1}>
        <Box flexDirection="column" marginRight={4}>
          <Text>
            📋 Open: <Text color="cyan">{tasksOpen}</Text>
          </Text>
          <Text>
            🔄 In Progress: <Text color="yellow">{tasksInProgress}</Text>
          </Text>
          <Text>
            ✅ Done: <Text color="green">{tasksDone}</Text>
          </Text>
        </Box>
        <Box flexDirection="column">
          <Text>
            🎯 Tokens: <Text color={getTokenColor()}>{tokensUsed.toLocaleString()}</Text> / {tokenBudget.toLocaleString()}
          </Text>
          <Text>
            📊 Usage: <Text color={getTokenColor()}>{tokenPercentage.toFixed(1)}%</Text>
          </Text>
        </Box>
      </Box>
    </Box>
  );
};
