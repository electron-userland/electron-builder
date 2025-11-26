import { LogEntry, LogLevel } from "./rolling-log";

export type TaskStatus = "pending" | "running" | "success" | "error";

export interface Task {
  id: string;
  label: string;
  status: TaskStatus;
  logs: LogEntry[];       // full history
  recentLogs: LogEntry[]; // last N logs for display
}

export class TaskController {
  private task: Task;
  private onUpdate: () => void;
  private readonly maxRecent = 5;

  constructor(label: string, onUpdate: () => void) {
    this.onUpdate = onUpdate;
    this.task = {
      id: Math.random().toString(36).slice(2),
      label,
      status: "pending",
      logs: [],
      recentLogs: [],
    };
  }

  get snapshot() {
    return this.task;
  }

  log(message: string, level: LogLevel) {
    const entry = { message, level };
    this.task.logs.push(entry);
    if (this.task.status === "running") {
      this.task.recentLogs.push(entry);
      if (this.task.recentLogs.length > this.maxRecent) {
        this.task.recentLogs.shift();
      }
    }
    this.onUpdate();
  }

  start() {
    this.task.status = "running";
    this.task.recentLogs = [];
    this.onUpdate();
  }

  complete(status: TaskStatus = "success") {
    this.task.status = status;
    this.task.recentLogs = [];
    this.onUpdate();
  }
}
