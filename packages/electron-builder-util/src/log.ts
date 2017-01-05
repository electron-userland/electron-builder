import { yellow, green, blue } from "chalk"
import WritableStream = NodeJS.WritableStream
import BluebirdPromise from "bluebird-lst-c"
import { eraseLines } from "ansi-escapes"
import * as cursor from "cli-cursor"
import prettyMs from "pretty-ms"
import { get as getEmoji } from "node-emoji"

interface Line {
  // text must be \n terminated
  readonly text: string

  readonly promise?: BluebirdPromise<any>
}

class SimpleLine implements Line {
  //noinspection JSUnusedGlobalSymbols
  constructor(public text: string, public promise?: BluebirdPromise<any>) {
  }
}

class Task implements Line {
  private readonly start = process.hrtime()

  constructor(public text: string, private rawText: string, public promise?: BluebirdPromise<any>) {
  }

  done() {
    const duration = process.hrtime(this.start)
    const ms = duration[0] * 1000 + duration[1] / 1e6
    this.text = `${this.rawText} ${green(prettyMs(ms))}\n`
  }
}

class Logger {
  private lines: Array<Line> = []
  private logTime = process.env.LOG_TIME === "true"

  private readonly isTTY = (<any>process.stdout).isTTY

  constructor(private stream: WritableStream) {
  }

  warn(message: string): void {
    if (this.isTTY) {
      this.log(getEmoji("warning") + "  " + yellow(message))
    }
    else {
      this.log(yellow(`Warning: ${message}`))
    }
  }

  log(message: string): void {
    const text = `${message}\n`
    if (this.lines.length === 0) {
      this.stream.write(text)
    }
    else {
      this.lines.push(new SimpleLine(text))
      this.render()
    }
  }

  subTask(title: string, _promise: BluebirdPromise<any> | Promise<any>): BluebirdPromise<any> {
    if (!this.logTime) {
      return <BluebirdPromise<any>>_promise
    }
    return this.task(title, _promise)
  }

  task(title: string, _promise: BluebirdPromise<any> | Promise<any>): BluebirdPromise<any> {
    const promise = <BluebirdPromise<any>>_promise

    if (!this.logTime) {
      this.log(`${title}\n`)
      return promise
    }

    const task = new Task(blue(title) + "\n", title, promise)
    this.lines.push(task)
    promise
      .then(() => {
        task.done()
        this.render()
      })

    this.render()

    return promise
  }

  private render() {
    const prevLineCount = this.lines.length
    if (prevLineCount === 0) {
      cursor.show()
      return
    }

    cursor.hide()

    let out = ""
    let firstPendingLineIndex = 0
    while (firstPendingLineIndex < prevLineCount) {
      const line = this.lines[firstPendingLineIndex]
      if (line.promise == null || !line.promise.isPending()) {
        out += line.text
        firstPendingLineIndex++
      }
      else {
        break
      }
    }

    if (firstPendingLineIndex > 0) {
      if (this.lines.length === firstPendingLineIndex) {
        this.lines.length = 0
        this.stream.write(eraseLines(prevLineCount) + out)
        cursor.show()
        return
      }

      this.lines.splice(0, firstPendingLineIndex)
    }

    for (const line of this.lines) {
      out += line.text
    }

    this.stream.write(eraseLines(prevLineCount) + out)
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