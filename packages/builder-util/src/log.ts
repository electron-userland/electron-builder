import chalk, { Chalk } from "chalk"
import _debug from "debug"
import WritableStream = NodeJS.WritableStream

let printer: ((message: string) => void) | null = null

export const debug = _debug("electron-builder")

export interface Fields {
  [index: string]: any
}

export function setPrinter(value: ((message: string) => void) | null) {
  printer = value
}

export type LogLevel = "info" | "warn" | "debug" | "notice" | "error"

export const PADDING = 2

export class Logger {
  constructor(protected readonly stream: WritableStream) {
  }

  messageTransformer: ((message: string, level: LogLevel) => string) = it => it

  filePath(file: string) {
    const cwd = process.cwd()
    return file.startsWith(cwd) ? file.substring(cwd.length + 1) : file
  }

  // noinspection JSMethodCanBeStatic
  get isDebugEnabled() {
    return debug.enabled
  }

  info(messageOrFields: Fields | null | string, message?: string, logName?: string) {
    this.doLog(message, messageOrFields, "info", logName)
  }

  error(messageOrFields: Fields | null | string, message?: string, logName?: string) {
    this.doLog(message, messageOrFields, "error", logName)
  }

  warn(messageOrFields: Fields | null | string, message?: string, logName?: string) {
    this.doLog(message, messageOrFields, "warn", logName)
  }

  debug(fields: Fields | null, message: string, logName?: string) {
    if (debug.enabled) {
      this._doLog(message, fields, "debug", logName)
    }
  }

  private doLog(message: string | undefined | Error, messageOrFields: Fields | null | string, level: LogLevel, logName: string | undefined) {
    if (message === undefined) {
      this._doLog(messageOrFields as string, null, level, logName)
    }
    else {
      this._doLog(message, messageOrFields as Fields | null, level, logName)
    }
  }

  private _doLog(message: string | Error, fields: Fields | null, level: LogLevel, logName: string | undefined) {
    // noinspection SuspiciousInstanceOfGuard
    if (message instanceof Error) {
      message = message.stack || message.toString()
    }
    else {
      message = message.toString()
    }

    const levelIndicator = level === "error" ? "⨯" : "•"
    const color = LEVEL_TO_COLOR[level]
    this.stream.write(`${" ".repeat(PADDING)}${color(levelIndicator)} `)
    this.stream.write(Logger.createMessage(this.messageTransformer(message, level), fields, level, color, PADDING + 2 /* level indicator and space */, logName))
    this.stream.write("\n")
  }

  static createMessage(message: string, fields: Fields | null, level: LogLevel, color: (it: string) => string, messagePadding = 0, logName?: string): string {
    if (fields == null) {
      return message
    }

    const printLogName = logName || message

    const fieldPadding = " ".repeat(Math.max(2, 16 - printLogName.length))
    let text = (level === "error" ? color(printLogName) : printLogName) + fieldPadding
    const fieldNames = Object.keys(fields)
    let counter = 0
    for (const name of fieldNames) {
      let fieldValue = fields[name]
      let valuePadding: string | null = null
      if (fieldValue != null && typeof fieldValue === "string" && fieldValue.includes("\n")) {
        valuePadding = " ".repeat(messagePadding + printLogName.length + fieldPadding.length + 2)
        fieldValue = "\n" + valuePadding + fieldValue.replace(/\n/g, `\n${valuePadding}`)
      }
      else if (Array.isArray(fieldValue)) {
        fieldValue = JSON.stringify(fieldValue)
      }

      text += `${color(name)}=${fieldValue}`
      if (++counter !== fieldNames.length) {
        if (valuePadding == null) {
          text += " "
        }
        else {
          text += "\n" + valuePadding
        }
      }
    }
    return text
  }

  log(message: string): void {
    if (printer == null) {
      this.stream.write(`${message}\n`)
    }
    else {
      printer(message)
    }
  }
}

const LEVEL_TO_COLOR: { [index: string]: Chalk } = {
  info: chalk.blue,
  warn: chalk.yellow,
  error: chalk.red,
  debug: chalk.white,
}

export const log = new Logger(process.stdout)