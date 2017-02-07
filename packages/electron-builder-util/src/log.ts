import { yellow } from "chalk"
import WritableStream = NodeJS.WritableStream
import BluebirdPromise from "bluebird-lst-c"
import { get as getEmoji } from "node-emoji"

let printer: ((message: string) => void) | null = null

export function setPrinter(value: ((message: string) => void) | null) {
  printer = value
}

class Logger {
  private readonly isTTY = (<any>process.stdout).isTTY

  constructor(private stream: WritableStream) {
  }

  warn(message: string): void {
    this.log(this.isTTY ? (getEmoji("warning") + "  " + yellow(message)) : yellow(`Warning: ${message}`))
  }

  log(message: string): void {
    if (printer == null) {
      this.stream.write(`${message}\n`)
    }
    else {
      printer(message)
    }
  }

  subTask(title: string, _promise: BluebirdPromise<any> | Promise<any>): BluebirdPromise<any> {
    return <BluebirdPromise<any>>_promise
  }

  task(title: string, _promise: BluebirdPromise<any> | Promise<any>): BluebirdPromise<any> {
    const promise = <BluebirdPromise<any>>_promise
    this.log(title)
    return promise
  }
}

const logger = new Logger(process.stdout)

export function warn(message: string) {
  logger.warn(message)
}

export function log(message: string) {
  logger.log(message)
}

export function subTask(title: string, promise: BluebirdPromise<any> | Promise<any>): BluebirdPromise<any> {
  return logger.subTask(title, promise)
}

export function task(title: string, promise: BluebirdPromise<any> | Promise<any>): BluebirdPromise<any> {
  return logger.task(title, promise)
}