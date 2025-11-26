import * as React from "react";
import { Box, Text } from "ink";
import { Task } from "./task";
import { RollingLog } from "./rolling-log";

interface Props {
  tasks: Task[];
}

const truncateJson = (obj: unknown, max = 60) => {
  try {
    const raw = JSON.stringify(obj);
    return raw.length > max ? raw.slice(0, max - 1) + "…" : raw;
  } catch {
    return "<invalid json>";
  }
};

export const TwoColumnDashboard: React.FC<Props> = ({ tasks }) => {
  return (
    <Box flexDirection="column" padding={1}>
      {tasks.map((task) => {
        const color =
          task.status === "success" ? "green" :
          task.status === "error" ? "red" :
          task.status === "running" ? "cyan" :
          "gray";

        return (
          <Box
            key={task.id}
            flexDirection="column"
            borderStyle="round"
            borderColor={color}
            padding={1}
            marginBottom={1}
          >
            {/* Header row */}
            <Box justifyContent="space-between">
              <Text color={color}>
                {task.title} — {task.status.toUpperCase()}
                {task.status === "running" ? ` ${task.progress}%` : ""}
              </Text>
              <Text color="yellow">
                {truncateJson(task.payload ?? {}, 60)}
              </Text>
            </Box>

            {/* Log column */}
            <Box flexDirection="row" marginTop={1}>
              <Box flexGrow={1}>
                <RollingLog logs={task.logs} maxLines={4} />
              </Box>
            </Box>
          </Box>
        );
      })}
    </Box>
  );
};
