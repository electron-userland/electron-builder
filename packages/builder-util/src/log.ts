import BluebirdPromise from "bluebird-lst"
import chalk from "chalk"
import { get as getEmoji } from "node-emoji"
import WritableStream = NodeJS.WritableStream

let printer: ((message: string) => void) | null = null

export function setPrinter(value: ((message: string) => void) | null) {
  printer = value
}

class Logger {
  constructor(protected readonly stream: WritableStream) {
  }

  warn(message: string): void {
    this.log(chalk.yellow(`Warning: ${message}`))
  }

  log(message: string): void {
    if (printer == null) {
      this.stream.write(`${message}\n`)
    }
    else {
      printer(message)
    }
  }

  task(title: string, _promise: BluebirdPromise<any> | Promise<any>): BluebirdPromise<any> {
    const promise = _promise as BluebirdPromise<any>
    this.log(title)
    return promise
  }
}

class TtyLogger extends Logger {
  constructor(stream: WritableStream) {
    super(stream)
  }

  warn(message: string): void {
    this.log(`${getEmoji("warning")}  ${chalk.yellow(message)}`)
  }
}

const logger = (process.stdout as any).isTTY ? new TtyLogger(process.stdout) : new Logger(process.stdout)

export function warn(message: string) {
  logger.warn(message)
}

export function log(message: string) {
  logger.log(message)
}

export function task(title: string, promise: BluebirdPromise<any> | Promise<any>): BluebirdPromise<any> {
  return logger.task(title, promise)
}