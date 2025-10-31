import React, { useState, useMemo } from "react";
import { Box, Text, useInput } from "ink";
import type { Task, TaskStatus } from "@/types";
import { Column } from "./components/Column";

export interface KanbanScreenProps {
  tasks: Task[];
  onTaskSelect?: (taskId: string) => void;
  onTaskMove?: (taskId: string, newStatus: TaskStatus) => void;
  onCreateTask?: () => void;
  onDeleteTask?: (taskId: string) => void;
  onExit?: () => void;
}

type ColumnType = "open" | "in-progress" | "done";

export const KanbanScreen: React.FC<KanbanScreenProps> = ({
  tasks,
  onTaskSelect,
  onTaskMove,
  onCreateTask,
  onDeleteTask,
  onExit,
}) => {
  const [selectedColumn, setSelectedColumn] = useState<ColumnType>("open");
  const [selectedCardIndex, setSelectedCardIndex] = useState<number>(0);

  // Group tasks by status
  const groupedTasks = useMemo(
    () => ({
      open: tasks.filter((t) => t.status === "open"),
      "in-progress": tasks.filter((t) => t.status === "in-progress"),
      done: tasks.filter((t) => t.status === "done"),
    }),
    [tasks],
  );

  // Get tasks for current column
  const currentTasks = groupedTasks[selectedColumn];

  // Keyboard navigation
  useInput((input, key) => {
    // Left/Right: Move between columns
    if (key.leftArrow) {
      if (selectedColumn === "in-progress") {
        setSelectedColumn("open");
        setSelectedCardIndex(0);
      } else if (selectedColumn === "done") {
        setSelectedColumn("in-progress");
        setSelectedCardIndex(0);
      }
    } else if (key.rightArrow) {
      if (selectedColumn === "open") {
        setSelectedColumn("in-progress");
        setSelectedCardIndex(0);
      } else if (selectedColumn === "in-progress") {
        setSelectedColumn("done");
        setSelectedCardIndex(0);
      }
    }

    // Up/Down: Move between cards
    else if (key.upArrow) {
      setSelectedCardIndex((prev) => Math.max(0, prev - 1));
    } else if (key.downArrow) {
      setSelectedCardIndex((prev) =>
        Math.min(currentTasks.length - 1, prev + 1),
      );
    }

    // Enter: Select card
    else if (key.return) {
      const selectedTask = currentTasks[selectedCardIndex];
      if (selectedTask) {
        onTaskSelect?.(selectedTask.config.id);
      }
    }

    // m: Move task
    else if (input === "m") {
      const selectedTask = currentTasks[selectedCardIndex];
      if (selectedTask) {
        // Determine next status
        const statusTransitions: Record<TaskStatus, TaskStatus | null> = {
          open: "in-progress",
          "in-progress": "done",
          done: null,
          blocked: "open",
          cancelled: null,
        };

        const nextStatus = statusTransitions[selectedTask.status];
        if (nextStatus) {
          onTaskMove?.(selectedTask.config.id, nextStatus);
        }
      }
    }

    // d: Delete task
    else if (input === "d") {
      const selectedTask = currentTasks[selectedCardIndex];
      if (selectedTask) {
        onDeleteTask?.(selectedTask.config.id);
      }
    }

    // n: New task
    else if (input === "n") {
      onCreateTask?.();
    }

    // q: Exit
    else if (input === "q") {
      onExit?.();
    }
  });

  return (
    <Box flexDirection="column" padding={1}>
      {/* Header */}
      <Box marginBottom={1}>
        <Text bold color="cyan">
          🌙 Task Kanban Board
        </Text>
      </Box>

      {/* Columns */}
      <Box flexDirection="row">
        <Column
          title="Open"
          tasks={groupedTasks.open}
          selected={selectedColumn === "open"}
          selectedCardIndex={selectedColumn === "open" ? selectedCardIndex : -1}
          onCardSelect={(index) => setSelectedCardIndex(index)}
        />

        <Column
          title="In Progress"
          tasks={groupedTasks["in-progress"]}
          selected={selectedColumn === "in-progress"}
          selectedCardIndex={
            selectedColumn === "in-progress" ? selectedCardIndex : -1
          }
          onCardSelect={(index) => setSelectedCardIndex(index)}
        />

        <Column
          title="Done"
          tasks={groupedTasks.done}
          selected={selectedColumn === "done"}
          selectedCardIndex={selectedColumn === "done" ? selectedCardIndex : -1}
          onCardSelect={(index) => setSelectedCardIndex(index)}
        />
      </Box>

      {/* Help text */}
      <Box marginTop={1} borderStyle="single" borderColor="gray" paddingX={1}>
        <Text color="gray">
          ←/→: Columns │ ↑/↓: Cards │ Enter: Details │ m: Move │ d: Delete │
          n: New │ q: Quit
        </Text>
      </Box>
    </Box>
  );
};
