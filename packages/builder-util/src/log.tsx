import * as React from "react"
import { render } from "ink"
import { TaskController } from "./logger/taskController"
import { BoxDashboard } from "./logger/BoxDashboard"
import { LogEntry, LogLevel } from "./logger/RollingLog"
import * as fs from "fs"
import * as path from "path"

import * as _debug from "debug"
import { Nullish } from "builder-util-runtime/src"
export const debug = _debug("electron-builder")
let printer: ((message: string) => void) | null = null

export function setPrinter(value: ((message: string) => void) | null) {
  printer = value
}

export const PADDING = 2

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
  ASAR = "creating asar archive with @electron/asar",
  FS_OP = "file system operation",
  PUBLISH = "publishing",
  NATIVE_REBUILD = "executing @electron/rebuild",
  GENERIC = "generic",
  VM = "leveraging virtual machine",
  TEST = "TEST",
}

export type Fields = Record<string, any>

export class Logger {
  private tasks: Record<ELECTRON_BUILDER_SIGNALS, TaskController> = {} as any
  private rerender: (() => void) | null = null
  private outDir: string

  constructor(outDir: string = "dist") {
    this.outDir = outDir

    // Create TaskControllers for all signals
    Object.values(ELECTRON_BUILDER_SIGNALS).forEach(signal => {
      this.tasks[signal] = new TaskController(signal, () => this.rerender?.())
    })

    // Initial render
    this.rerender = () => {
      render(
        <BoxDashboard tasks={Object.values(this.tasks).map(t => t.snapshot)} />
      )
    }

    this.rerender()
  }

  get isDebugEnabled() {
    return debug.enabled
  }


  filePath(file: string) {
    const cwd = process.cwd()
    return file.startsWith(cwd) ? file.substring(cwd.length + 1) : file
  }


  private getTask(signal: ELECTRON_BUILDER_SIGNALS) {
    return this.tasks[signal]
  }

  log(signal: ELECTRON_BUILDER_SIGNALS, message?: string, fields: Fields | Nullish = {}, level: LogLevel = "info") {
    const task = this.getTask(signal)
    if (!task) return

    if (task.snapshot.status !== "running") {
      task.start()
    }

    task.log(fields, message, level)
  }

  info(signal: ELECTRON_BUILDER_SIGNALS, fields: Fields | Nullish= {}, message?: string) {
    this.log(signal, message, fields, "info")
  }

  warn(signal: ELECTRON_BUILDER_SIGNALS, fields: Fields | Nullish= {}, message?: string) {
    this.log(signal, message, fields, "warn")
  }

  error(signal: ELECTRON_BUILDER_SIGNALS, fields: Fields | Nullish= {}, message?: string) {
    this.log(signal, message, fields, "error")
  }

  debug(signal: ELECTRON_BUILDER_SIGNALS, fields: Fields | Nullish= {}, message?: string) {
    this.log(signal, message, fields, "debug")
  }

  start(signal: ELECTRON_BUILDER_SIGNALS) {
    this.getTask(signal)?.start()
  }

  complete(signal: ELECTRON_BUILDER_SIGNALS, status: "success" | "error" = "success") {
    this.getTask(signal)?.complete(status)
  }

  saveLogs(filename: string = "build.log") {
    const filePath = path.join(this.outDir, filename)
    const allLogs: string[] = []

    Object.values(this.tasks).forEach(task => {
      task.snapshot.logs.forEach((entry: LogEntry) => {
        allLogs.push(`[${task.snapshot.label}] ${entry.level.toUpperCase()}: ${entry.message}`)
      })
    })

    fs.mkdirSync(this.outDir, { recursive: true })
    fs.writeFileSync(filePath, allLogs.join("\n"), { encoding: "utf-8" })
  }
}

// Singleton
export const log = new Logger("dist")
