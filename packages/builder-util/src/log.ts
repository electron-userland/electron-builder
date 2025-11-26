import * as React from "react";
import { render } from "ink";
import { TaskController  } from "./logger/task";
import { RowDashboard } from "./logger/dashboard";
import * as fs from "fs";
import * as path from "path";

import * as _debug from "debug";

const debug = _debug("electron-builder");

// Enum of signals
export enum ELECTRON_BUILDER_SIGNALS {
  ALL = "all",
  INIT = "initializing build",
  BUILD = "building",
  CONFIG = "reading configuration",
  DEPENDENCY_INSTALLATION = "installing app dependencies",
  DOWNLOAD = "downloading",
  DOWNLOAD_COMPLETE = "download complete",
  COLLECT_FILES = "collecting files and modules",
  CODE_SIGN = "code signing",
  TOTAL = "building with electron-builder",
  PACKAGING = "packaging application",
  COPYING = "copying",
  ARTIFACTS = "generating artifacts",
  ASAR = "creating asar archive",
  FS_OP = "file system operation",
  PUBLISH = "publishing",
  NATIVE_REBUILD = "executing @electron/rebuild",
  GENERIC = "generic",
  VM = "leveraging virtual machine",
  TEST = "TEST",
}

export type Fields = Record<string, any>;

export class Logger {
  private tasks: Record<ELECTRON_BUILDER_SIGNALS, TaskController> = {} as any;
  private rerender: (() => void) | null = null;
  private outDir: string;

  constructor(outDir: string = "dist") {
    this.outDir = outDir;

    // Create TaskControllers for all signals
    Object.values(ELECTRON_BUILDER_SIGNALS).forEach(signal => {
      this.tasks[signal] = new TaskController(signal, () => this.rerender?.());
    });

    // Initial render
    this.rerender = () => {
      render(
        <RowDashboard tasks={Object.values(this.tasks).map(t => t.snapshot)} />
      );
    };

    this.rerender();
  }

  get isDebugEnabled(): boolean {
    return debug.enabled;
  }

  private log(signal: ELECTRON_BUILDER_SIGNALS, fields: Fields, message: string, level: LogLevel = "info") {
    const task = this.tasks[signal];
    if (!task) return;

    if (task.snapshot.status !== "running") {
      task.start();
    }

    task.log(message, level);
  }

  info(signal: ELECTRON_BUILDER_SIGNALS, fields: Fields, message: string) {
    this.log(signal, fields, message, "info");
  }

  warn(signal: ELECTRON_BUILDER_SIGNALS, fields: Fields, message: string) {
    this.log(signal, fields, message, "warn");
  }

  error(signal: ELECTRON_BUILDER_SIGNALS, fields: Fields, message: string) {
    this.log(signal, fields, message, "error");
  }

  debug(signal: ELECTRON_BUILDER_SIGNALS, fields: Fields, message: string) {
    this.log(signal, fields, message, "debug");
  }

  start(signal: ELECTRON_BUILDER_SIGNALS) {
    this.tasks[signal].start();
  }

  complete(signal: ELECTRON_BUILDER_SIGNALS, status: "success" | "error" = "success") {
    this.tasks[signal].complete(status);
  }

  // Save full logs to a file
  saveLogs(filename: string = "build.log") {
    const filePath = path.join(this.outDir, filename);
    const allLogs: string[] = [];

    Object.values(this.tasks).forEach(task => {
      task.snapshot.logs.forEach((entry: LogEntry) => {
        allLogs.push(`[${task.snapshot.label}] ${entry.level.toUpperCase()}: ${entry.message}`);
      });
    });

    fs.mkdirSync(this.outDir, { recursive: true });
    fs.writeFileSync(filePath, allLogs.join("\n"), { encoding: "utf-8" });
  }
}

// Singleton
export const log = new Logger("dist");
