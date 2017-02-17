import { setPrinter } from "electron-builder-util/out/log"
import ProgressBar from "progress-ex"

export class MultiProgress {
  private readonly stream = <any>process.stdout
  private cursor = 0

  private totalLines = 0

  private isLogListenerAdded = false

  private barCount = 0

  createBar(format: string, options: any) {
    options.stream = this.stream

    const bar: any = new ProgressBar(format, options)
    this.barCount++
    let index = -1

    const render = bar.render
    bar.render = (tokens: any) => {
      if (index === -1) {
        index = this.totalLines
        this.allocateLines(1)
      }
      else {
        this.moveCursor(index)
      }

      render.call(bar, tokens)

      if (!this.isLogListenerAdded) {
        this.isLogListenerAdded = true
        setPrinter(message => {
          let newLineCount = 0
          let newLineIndex = message.indexOf("\n")
          while (newLineIndex > -1) {
            newLineCount++
            newLineIndex = message.indexOf("\n", ++newLineIndex)
          }

          this.allocateLines(newLineCount + 1)
          this.stream.write(message)
        })
      }
    }

    bar.terminate = () => {
      this.barCount--
      if (this.barCount === 0 && this.totalLines > 0) {
        this.allocateLines(1)
        this.totalLines = 0
        this.cursor = 0
        setPrinter(null)
        this.isLogListenerAdded = false
      }
    }

    bar.tick = (len: number, tokens: any) => {
      if (len !== 0) {
        len = len || 1
      }

      if (tokens != null) {
        bar.tokens = tokens
      }

      // start time for eta
      if (bar.curr == 0) {
        bar.start = new Date()
      }

      bar.curr += len

      if (bar.complete) {
        return
      }

      bar.render()

      // progress complete
      if (bar.curr >= bar.total) {
        bar.complete = true
        bar.terminate()
        bar.callback(this)
      }
    }

    return bar
  }

  private allocateLines(count: number) {
    this.stream.moveCursor(0, this.totalLines - 1)
    // if cursor pointed to previous line where \n is already printed, another \n is ignored, so, we can simply print it
    this.stream.write("\n")
    this.totalLines += count
    this.cursor = this.totalLines - 1
  }

  private moveCursor(index: number) {
    this.stream.moveCursor(0, index - this.cursor)
    this.cursor = index
  }

  terminate() {
    this.moveCursor(this.totalLines)
    this.stream.clearLine()
    this.stream.cursorTo(0)
  }
}