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

  info(messageOrFields: Fields | null | string, message?: string) {
    this.doLog(message, messageOrFields, "info")
  }

  error(messageOrFields: Fields | null | string, message?: string) {
    this.doLog(message, messageOrFields, "error")
  }

  warn(messageOrFields: Fields | null | string, message?: string): void {
    this.doLog(message, messageOrFields, "warn")
  }

  debug(fields: Fields | null, message: string) {
    if (debug.enabled) {
      this._doLog(message, fields, "debug")
    }
  }

  private doLog(message: string | undefined | Error, messageOrFields: Fields | null | string, level: LogLevel) {
    if (message === undefined) {
      this._doLog(messageOrFields as string, null, level)
    }
    else {
      this._doLog(message, messageOrFields as Fields | null, level)
    }
  }

  private _doLog(message: string | Error, fields: Fields | null, level: LogLevel) {
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
    this.stream.write(Logger.createMessage(this.messageTransformer(message, level), fields, level, color, PADDING + 2 /* level indicator and space */))
    this.stream.write("\n")
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
      if (fieldValue != null && typeof fieldValue === "string" && fieldValue.includes("\n")) {
        valuePadding = " ".repeat(messagePadding + message.length + fieldPadding.length + 2)
        fieldValue = "\n" + valuePadding + fieldValue.replace(/\n/g, `\n${valuePadding}`)
      }
      else if (Array.isArray(fieldValue)) {
        fieldValue = JSON.stringify(fieldValue)
      }
      else if (typeof fieldValue === "object") {
        // fieldValue = safeStringifyJson(fieldValue)
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