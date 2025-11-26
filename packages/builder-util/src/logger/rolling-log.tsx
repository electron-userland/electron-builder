import * as React from "react"
import { Text } from "ink"
import { Nullish } from "builder-util-runtime"

export type LogLevel = "info" | "warn" | "error" | "debug" | "success"

export interface LogEntry {
  message: string | Nullish
  fields: Record<string, any> | Nullish
  level: LogLevel
}

interface Props {
  logs: LogEntry[]
  maxLines?: number
}

export const RollingLog: React.FC<Props> = ({ logs, maxLines = 5 }) => {
  const visible = logs.slice(-maxLines)

  const colorFor = (lvl: LogLevel) => {
    switch (lvl) {
      case "error":
        return "red"
      case "warn":
        return "yellow"
      case "success":
        return "green"
      case "info":
      default:
        return "cyan"
    }
  }

  return (
    <>
      {visible.map((entry, idx) => (
        <Text key={idx} color={colorFor(entry.level)}>
          {entry.message}
        </Text>
      ))}
    </>
  )
}
