import * as React from "react";
import { Box, Text } from "ink";
import { TaskController, Task } from "./task";

interface Props {
  tasks: Task[];
}

export const RowDashboard: React.FC<Props> = ({ tasks }) => {
  const colorForLevel = (level: string) => {
    switch (level) {
      case "error": return "red";
      case "warn": return "yellow";
      case "success": return "green";
      case "info":
      default: return "cyan";
    }
  };

  return (
    <Box flexDirection="column" padding={1}>
      {tasks.map(task => (
        <Box key={task.id} flexDirection="column">
          {/* Full width row for the SIGNAL enum */}
          <Text color={task.status === "running" ? "cyan" :
                      task.status === "success" ? "green" :
                      task.status === "error" ? "red" : "gray"}>
            {task.label} — {task.status.toUpperCase()}
          </Text>

          {/* Rolling logs, only while running */}
          {task.status === "running" && task.recentLogs.map((entry, idx) => (
            <Text key={idx} color={colorForLevel(entry.level)}>
              {entry.message}
            </Text>
          ))}
        </Box>
      ))}
    </Box>
  );
};
