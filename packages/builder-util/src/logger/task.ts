import { LogEntry } from "./rolling-log";

export type TaskStatus = "pending" | "running" | "success" | "error";

export interface Task {
  id: string;
  title: string;
  status: TaskStatus;
  progress: number;
  logs: LogEntry[];
  payload?: unknown;
}

export class TaskController {
  private task: Task;
  private onUpdate: () => void;

  constructor(title: string, onUpdate: () => void) {
    this.onUpdate = onUpdate;
    this.task = {
      id: crypto.randomUUID(),
      title,
      status: "pending",
      progress: 0,
      logs: [],
    };
  }

  get snapshot() {
    return this.task;
  }

  start() {
    this.task.status = "running";
    this.onUpdate();
  }

  log(message: string, level: LogEntry["level"] = "info") {
    this.task.logs.push({ message, level });
    this.onUpdate();
  }

  setProgress(p: number) {
    this.task.progress = Math.min(100, Math.max(0, p));
    this.onUpdate();
  }

  setPayload(obj: unknown) {
    this.task.payload = obj;
    this.onUpdate();
  }

  success() {
    this.task.status = "success";
    this.onUpdate();
  }

  error(message?: string) {
    this.task.status = "error";
    if (message) this.log(message, "error");
    this.onUpdate();
  }
}
