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

export const PADDING = 3

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

  notice(messageOrFields: Fields | null | string, message?: string): void {
    this.doLog(message, messageOrFields, "notice")
  }

  warn(messageOrFields: Fields | null | string, message?: string): void {
    this.doLog(message, messageOrFields, "warn")
  }

  debug(fields: Fields | null, message: string) {
    if (debug.enabled) {
      this._doLog(message, fields, "debug")
    }
  }

  private doLog(message: string | undefined, messageOrFields: Fields | null | string, level: LogLevel) {
    if (message === undefined) {
      this._doLog(messageOrFields as string, null, level)
    }
    else {
      this._doLog(message, messageOrFields as Fields | null, level)
    }
  }

  private _doLog(message: string, fields: Fields | null, level: LogLevel) {
    const levelIndicator = "•"
    const color = LEVEL_TO_COLOR[level]
    this.stream.write(`${" ".repeat(PADDING)}${color(levelIndicator)} `)
    this.stream.write(Logger.createMessage(this.messageTransformer(message, level), fields, level, color))
    this.stream.write("\n")
  }

  static createMessage(message: string, fields: Fields | null, level: LogLevel, color: (it: string) => string): string {
    let text = message

    const fieldPadding = " ".repeat(Math.max(0, 16 - message.length))
    text += fieldPadding

    if (fields != null) {
      for (const name of Object.keys(fields)) {
        let fieldValue = fields[name]
        if (fieldValue != null && typeof fieldValue === "string" && fieldValue.includes("\n")) {
          fieldValue = ("\n" + fieldValue)
            .replace(/\n/g, `\n${" ".repeat(PADDING)}${fieldPadding}`)
        }

        text += ` ${color(name)}=${Array.isArray(fieldValue) ? JSON.stringify(fieldValue) : fieldValue}`
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
  notice: chalk.yellow,
  warn: chalk.yellow,
  debug: chalk.gray,
}

export const log = new Logger(process.stdout)