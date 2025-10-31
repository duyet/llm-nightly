import React from "react";
import { Box, Text } from "ink";
import type { Task } from "@/types";
import { Card } from "./Card";

export interface ColumnProps {
  title: string;
  tasks: Task[];
  selected: boolean;
  selectedCardIndex?: number;
  onSelect?: () => void;
  onCardSelect?: (index: number) => void;
}

export const Column: React.FC<ColumnProps> = ({
  title,
  tasks,
  selected,
  selectedCardIndex = -1,
  onSelect,
  onCardSelect,
}) => {
  const borderColor = selected ? "cyan" : "gray";

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={borderColor}
      paddingX={1}
      minWidth={30}
      marginRight={1}
    >
      {/* Column header */}
      <Box marginBottom={1}>
        <Text bold color={selected ? "cyan" : "white"}>
          {title} ({tasks.length})
        </Text>
      </Box>

      {/* Task cards */}
      <Box flexDirection="column">
        {tasks.length === 0 ? (
          <Text color="gray" dimColor>
            No tasks
          </Text>
        ) : (
          tasks.map((task, index) => (
            <Box key={task.config.id} marginBottom={1}>
              <Card
                task={task}
                selected={selected && selectedCardIndex === index}
                onClick={() => onCardSelect?.(index)}
              />
            </Box>
          ))
        )}
      </Box>
    </Box>
  );
};
