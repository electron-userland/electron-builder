import * as chalk from "chalk"
import { Chalk } from "chalk"
import _debug from "debug"
import WritableStream = NodeJS.WritableStream

import * as signale from "signale"

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

  // will be filtered out in Signale interactive mode
  GENERIC = "generic",
  VM = "leveraging virtual machine",

  TEST = "TEST",
}

const logger = new signale.Signale({
  types: {
    info: {
      badge: "ℹ️",
      color: "blue",
      label: "",
    },
    warn: {
      badge: "⚠️",
      color: "yellow",
      label: "warn",
    },
    error: {
      badge: "⨯",
      color: "red",
      label: "error",
    },
    debug: {
      badge: "🐛",
      color: "magenta",
      label: "debug",
    },
  },
})
logger.config({ displayTimestamp: true, displayLabel: true })

let printer: ((message: string) => void) | null = null

export const debug = _debug("electron-builder")

export interface Fields {
  [index: string]: any
}

export function setPrinter(value: ((message: string) => void) | null) {
  printer = value
}

export type LogLevel = signale.DefaultMethods

export const PADDING = 2

type TimeEndType = ReturnType<typeof logger.timeEnd> & { logger?: signale.Signale; counter?: number }

export class Logger {
  // clean up logs since concurrent tests are impossible to track logic execution with console concurrency "noise"
  private readonly shouldDisableNonErrorLoggingVitest = process.env.VITEST && !this.isDebugEnabled

  public readonly signale = signale

  readonly timeLoggedEvents = new Map<string, TimeEndType>()
  logDurationReport() {
    const result: Array<{ label: string; span: number }> = []
    for (const { label, span } of this.timeLoggedEvents.values()) {
      result.push({ label, span: span ?? 0 })
    }
    this.info(ELECTRON_BUILDER_SIGNALS.GENERIC, result, "event duration report")
  }

  constructor() {
    if (this.shouldDisableNonErrorLoggingVitest) {
      console.log(`non-error logging is silenced during VITEST workflow when DEBUG=electron-builder flag is not set`)
    }
  }

  messageTransformer: (message: string, level: LogLevel) => string = it => it

  filePath(file: string) {
    const cwd = process.cwd()
    return file.startsWith(cwd) ? file.substring(cwd.length + 1) : file
  }

  // noinspection JSMethodCanBeStatic
  get isDebugEnabled() {
    return debug.enabled
  }

  private getInteractiveSignale(label: ELECTRON_BUILDER_SIGNALS): Required<TimeEndType>  {
    // label = ELECTRON_BUILDER_SIGNALS.GENERIC
    if (this.timeLoggedEvents.has(label)) {
      return this.timeLoggedEvents.get(label) as Required<TimeEndType>
    }

    const logger = new signale.Signale({
      interactive: true,
      scope: label,
      types: {
        info: {
          badge: "ℹ️",
          color: "blue",
          label: "",
        },
        warn: {
          badge: "⚠️",
          color: "yellow",
          label: "warn",
        },
        error: {
          badge: "⨯",
          color: "red",
          label: "error",
        },
        debug: {
          badge: "🐛",
          color: "magenta",
          label: "debug",
        },
      },
    })
    const config = { logger, label, span: 0, counter: 0 }
    this.timeLoggedEvents.set(label, config)
    return config
  }

  start(label: ELECTRON_BUILDER_SIGNALS, interactive: boolean = true) {
    const instance = this.getInteractiveSignale(label)
    if (interactive) {
      instance.logger.start(label)
    }
    const id = instance.logger.time(label)
    this.timeLoggedEvents.set(id, { ...instance, span: 0 })
    return id
  }

  complete(label: ELECTRON_BUILDER_SIGNALS) {
    const instance = this.getInteractiveSignale(label)
    const { span } = instance.logger.timeEnd(label) // span: time elapsed
    this.timeLoggedEvents.set(label, { ...instance, span })
    return span
  }

  info(logger: ELECTRON_BUILDER_SIGNALS, messageOrFields: Fields | null, message?: string) {
    this.doLog(message, messageOrFields, "info", logger)
  }

  error(logger: ELECTRON_BUILDER_SIGNALS, messageOrFields: Fields | null | Error, message?: string) {
    this.doLog(message, messageOrFields, "error", logger)
  }

  warn(logger: ELECTRON_BUILDER_SIGNALS, messageOrFields: Fields | null, message?: string): void {
    // this.doLog(message, messageOrFields, "warn", logger)
  }

  debug(logger: ELECTRON_BUILDER_SIGNALS, fields: Fields | null, message: string) {
    if (debug.enabled) {
      this._doLog(message, fields, "debug", logger)
    }
  }

  private doLog(message: string | undefined, messageOrFields: Fields | null, level: LogLevel, logger: ELECTRON_BUILDER_SIGNALS) {
    this._doLog(message ?? "               ", messageOrFields, level, logger)
  }

  private _doLog(message: string, fields: Fields | null | Error, level: LogLevel, logger: ELECTRON_BUILDER_SIGNALS) {
    if (!this.timeLoggedEvents.has(logger)) {
      this.start(logger, true)
    }
    if (this.shouldDisableNonErrorLoggingVitest) {
      if (
        [
          "warn", // is actually a bit too noisy
          "error",
        ].includes(level)
      ) {
        // log error message to console so VITEST can capture stacktrace as well
        console.log(message, fields)
      }
      return // ignore info/warn message during VITEST workflow if debug flag is disabled
    }
    const instance = this.getInteractiveSignale(logger)
    // loggerInstance.await("[%d/4] - Process A", 1)

    // setTimeout(() => {
    //   loggerInstance.success("[%d/4] - Process A", 2)
    //   setTimeout(() => {
    //     loggerInstance.await("[%d/4] - Process B", 3)
    //     setTimeout(() => {
    //       loggerInstance.error("[%d/4] - Process B", 4)
    //       setTimeout(() => {}, 1000)
    //     }, 1000)
    //   }, 1000)
    // }, 1000)
    //
    // switch (level) {
    //   case "info":
    //     loggerInstance.config({ displayLabel: false })
    //     break
    //   case "warn":
    //     message = Logger.createMessage(message, fields as Fields | null, level, chalk.yellow, PADDING)
    //     break
    //   case "debug":
    //     message = Logger.createMessage(message, fields as Fields | null, level, chalk.magenta, PADDING)
    //     break
    //   case "error":
    //     if (fields instanceof Error) {
    //       message += `: ${fields.stack ?? fields.message}`
    //       fields = null
    //     }
    //     message = Logger.createMessage(message, fields as Fields | null, level, chalk.red, PADDING)
    //     break
    //   default:
    //     message = Logger.createMessage(message, fields as Fields | null, level, chalk.white, PADDING)
    //     break
    // }
    instance.logger[level](`[${instance.counter++ > 8 ? instance.counter : `0${instance.counter}`}]       ${message}               ${JSON.stringify(fields)}`)
  }

  static createMessage(message: string, fields: Fields | null, level: LogLevel, color: (it: string) => string, messagePadding = 0): string {
    if (fields == null) {
      return message
    }

    const fieldPadding = " ".repeat(Math.max(2, 16 - message.length))
    let text = (level === "error" ? color(message) : message) + fieldPadding
    const fieldNames = Object.keys(fields)
    let counter = 0
    for (const name of fieldNames) {
      let fieldValue = fields[name]
      let valuePadding: string | null = null
      // Remove unnecessary line breaks
      if (fieldValue != null && typeof fieldValue === "string" && fieldValue.includes("\n")) {
        valuePadding = " ".repeat(messagePadding + message.length + fieldPadding.length + 2)
        fieldValue = fieldValue.replace(/\n\s*\n/g, `\n${valuePadding}`)
      } else if (Array.isArray(fieldValue)) {
        fieldValue = JSON.stringify(fieldValue)
      }

      text += `${color(name)}=${fieldValue}`
      if (++counter !== fieldNames.length) {
        if (valuePadding == null) {
          text += " "
        } else {
          text += "\n" + valuePadding
        }
      }
    }
    return text
  }

  // log(message: string): void {
  //   if (printer == null) {
  //     this.stream.write(`${message}\n`)
  //   } else {
  //     printer(message)
  //   }
  // }
}

// const LEVEL_TO_COLOR: { [index: string]: Chalk } = {
//   info: chalk.blue,
//   warn: chalk.yellow,
//   error: chalk.red,
//   debug: chalk.white,
// }

export const log = new Logger()
