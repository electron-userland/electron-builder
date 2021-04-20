import { setPrinter } from "builder-util/out/log"
import { ProgressBar } from "./progress"

export class MultiProgress {
  private readonly stream = process.stdout as any
  private cursor = 0

  private totalLines = 0

  private isLogListenerAdded = false

  private barCount = 0

  createBar(format: string, options: any): ProgressBar {
    options.stream = this.stream

    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const manager = this
    class MultiProgressBar extends ProgressBar {
      private index = -1

      constructor(format: string, options: any) {
        super(format, options)
      }

      render() {
        if (this.index === -1) {
          this.index = manager.totalLines
          manager.allocateLines(1)
        } else {
          manager.moveCursor(this.index)
        }

        super.render()

        if (!manager.isLogListenerAdded) {
          manager.isLogListenerAdded = true
          setPrinter(message => {
            let newLineCount = 0
            let newLineIndex = message.indexOf("\n")
            while (newLineIndex > -1) {
              newLineCount++
              newLineIndex = message.indexOf("\n", ++newLineIndex)
            }

            manager.allocateLines(newLineCount + 1)
            manager.stream.write(message)
          })
        }
      }

      terminate() {
        manager.barCount--
        if (manager.barCount === 0 && manager.totalLines > 0) {
          manager.allocateLines(1)
          manager.totalLines = 0
          manager.cursor = 0
          setPrinter(null)
          manager.isLogListenerAdded = false
        }
      }
    }

    const bar = new MultiProgressBar(format, options)
    this.barCount++
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
