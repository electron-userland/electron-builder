import * as React from "react"
import { Box, Text } from "ink"
import { Task } from "./taskController"
import { RollingLog } from "./RollingLog"

interface Props {
  tasks: Task[]
  maxLogLines?: number
}

export const BoxDashboard: React.FC<Props> = ({ tasks, maxLogLines = 5 }) => {
  return (
    <Box flexDirection="column" padding={1}>
      {tasks
        .filter(task => task.status === "running")
        .map(task => (
          <Box
            key={task.id}
            flexDirection="column"
            borderStyle="round"
            borderColor={task.status === "running" ? "cyan" : task.status === "success" ? "green" : task.status === "error" ? "red" : "gray"}
            padding={1}
            marginBottom={1}
          >
            {/* Header row */}
            <Text>
              {task.label} — {task.status.toUpperCase()}
            </Text>

            {/* Rolling logs only when running */}
            {task.status === "running" && <RollingLog logs={task.recentLogs} maxLines={maxLogLines} />}
          </Box>
        ))}
    </Box>
  )
}
