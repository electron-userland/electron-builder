import { LogLimiter } from "builder-util-runtime/internal"
import chalk from "chalk"
import { Chalk } from "chalk"
import _debug from "debug"
import * as path from "path"
type WritableStream = NodeJS.WritableStream

let printer: ((message: string) => void) | null = null

export const debug = _debug("electron-builder")

export interface Fields {
  [index: string]: any
}

export function setPrinter(value: ((message: string) => void) | null) {
  printer = value
}

export type LogLevel = "info" | "warn" | "debug" | "error"

export const PADDING = 2

export interface LogLimitOptions {
  /** Stable identifier of the message. Use an explicit key, not the message text: messages embed values (paths, platforms) that vary between calls. */
  readonly key: string
  /** How many times the message may be emitted. Defaults to 1. */
  readonly max?: number
  /**
   * Object whose lifetime bounds the count (a packager, a target, a build's cancellation token), so each one gets
   * its own quota and the counters are garbage-collected with it. Defaults to the Logger itself: once per process
   * for the `log` singleton.
   */
  readonly scope?: object
}

/** The `info`/`warn`/`error`/`debug` methods of a {@link Logger}, each emitting only while the limit allows. Each returns whether it emitted. */
export interface LimitedLogger {
  info(messageOrFields: Fields | null | string, message?: string): boolean
  warn(messageOrFields: Fields | null | string, message?: string): boolean
  error(messageOrFields: Fields | null | string, message?: string): boolean
  /** Does not consume the quota while debug logging is disabled. */
  debug(fields: Fields | null, message: string): boolean
  /** Whether the limit has been reached, so a call site can skip computing an expensive message. */
  readonly isExhausted: boolean
}

// clean up logs since concurrent tests are impossible to track logic execution with console concurrency "noise"
export const shouldDisableNonErrorLoggingVitest = process.env.VITEST && !debug.enabled
export class Logger {
  constructor(protected readonly stream: WritableStream) {}

  messageTransformer: (message: string, level: LogLevel) => string = it => it

  private readonly limiter = new LogLimiter()

  /**
   * Emits through the returned methods at most `max` times per `key` (and `scope`), replacing hand-rolled
   * `xxxWarned = false` flags and `Set`s of already-warned keys:
   *
   * ```ts
   * log.limit({ key: "arch-all-expansion" }).warn({ expandsTo: "x64, arm64" }, "arch all no longer includes ia32")
   * log.limit({ key: "unsigned-update-manifest", scope: this }).warn(fields, message) // once per packager
   * ```
   *
   * Each emission still goes through {@link Logger.info} / {@link Logger.warn} / ..., so spies on those see only what was emitted.
   */
  limit(options: LogLimitOptions): LimitedLogger {
    const { key, max = 1, scope } = options
    const limiter = this.limiter
    const take = () => limiter.take(key, max, scope)
    return {
      info: (messageOrFields, message) => take() && (this.info(messageOrFields, message), true),
      warn: (messageOrFields, message) => take() && (this.warn(messageOrFields, message), true),
      error: (messageOrFields, message) => take() && (this.error(messageOrFields, message), true),
      // counted only when it would print: a debug-suppressed message must not use up the quota
      debug: (fields, message) => this.isDebugEnabled && take() && (this.debug(fields, message), true),
      get isExhausted() {
        return limiter.isExhausted(key, max, scope)
      },
    }
  }

  /** Shorthand for `limit({ key, max: 1, scope })`. */
  once(key: string, scope?: object): LimitedLogger {
    return this.limit({ key, scope })
  }

  /** Forgets recorded emissions of `key` (in `scope`), of every key in `scope`, or of everything. Intended for tests. */
  resetLimits(key?: string, scope?: object): void {
    this.limiter.reset(key, scope)
  }

  filePath(file: string) {
    const cwd = process.cwd()
    const relative = path.relative(cwd, file)
    return relative === "" || (!path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`)) ? relative : file
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
    } else {
      this._doLog(message, messageOrFields as Fields | null, level)
    }
  }

  private _doLog(message: string | Error, fields: Fields | null, level: LogLevel) {
    if (shouldDisableNonErrorLoggingVitest) {
      if (
        [
          // "warn", // is sometimes a bit too noisy
          "error",
        ].includes(level)
      ) {
        // log error message to console so VITEST can capture stacktrace as well
        console.log(message, fields)
      }
      return // ignore info/warn message during VITEST workflow if debug flag is disabled
    }

    // noinspection SuspiciousInstanceOfGuard
    if (message instanceof Error) {
      message = message.stack || message.toString()
    } else {
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

  log(message: string): void {
    if (printer == null) {
      this.stream.write(`${message}\n`)
    } else {
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
