import BluebirdPromise from "bluebird-lst"
import { yellow } from "chalk"
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
    this.log(yellow(`Warning: ${message}`))
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
    this.log(`  ${title}`)
    return <BluebirdPromise<any>>_promise
  }

  task(title: string, _promise: BluebirdPromise<any> | Promise<any>): BluebirdPromise<any> {
    const promise = <BluebirdPromise<any>>_promise
    this.log(title)
    return promise
  }
}

class TtyLogger extends Logger {
  constructor(stream: WritableStream) {
    super(stream)
  }

  warn(message: string): void {
    this.log(`${getEmoji("warning")}  ${yellow(message)}`)
  }
}

const logger = (<any>process.stdout).isTTY ? new TtyLogger(process.stdout) : new Logger(process.stdout)

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