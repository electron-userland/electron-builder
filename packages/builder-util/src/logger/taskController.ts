import { Nullish } from "builder-util-runtime"
import { Fields } from "../util"
import { LogEntry, LogLevel } from "./RollingLog"

export type TaskStatus = "pending" | "running" | "success" | "error"

export interface Task {
  id: string
  label: string
  status: TaskStatus
  logs: LogEntry[] // full history
  recentLogs: LogEntry[] // last N logs for display
}

export class TaskController {
  private task: Task
  private onUpdate: () => void
  private readonly maxRecent: number

  constructor(label: string, onUpdate: () => void, maxRecent = 5) {
    this.onUpdate = onUpdate
    this.maxRecent = maxRecent
    this.task = {
      id: Math.random().toString(36).slice(2),
      label,
      status: "pending",
      logs: [],
      recentLogs: [],
    }
  }

  get snapshot() {
    return this.task
  }

  log(fields: Fields | Nullish, message: string | Nullish, level: LogLevel) {
    const entry = { fields, message, level }
    this.task.logs.push(entry)

    if (this.task.status === "running") {
      this.task.recentLogs.push(entry)
      if (this.task.recentLogs.length > this.maxRecent) {
        this.task.recentLogs.shift()
      }
    }

    this.onUpdate()
  }

  start() {
    this.task.status = "running"
    this.task.recentLogs = []
    this.onUpdate()
  }

  complete(status: TaskStatus = "success") {
    this.task.status = status
    this.task.recentLogs = []
    this.onUpdate()
  }
}
