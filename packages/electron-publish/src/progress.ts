/*!
 * node-progress
 * Copyright(c) 2011 TJ Holowaychuk <tj@vision-media.ca>
 * MIT Licensed
 */

export abstract class ProgressBar {
  private readonly stream: any

  private current = 0
  total = 0
  private readonly width: number

  private chars: any
  private tokens: any = null
  private lastDraw = ""

  private start = 0

  private complete = false

  /**
   * Initialize a `ProgressBar` with the given `fmt` string and `options` or`total`.
   *
   * Options:
   *   - `curr` current completed index
   *   - `total` total number of ticks to complete
   *   - `width` the displayed width of the progress bar defaulting to total
   *   - `stream` the output stream defaulting to stderr
   *   - `head` head character defaulting to complete character
   *   - `complete` completion character defaulting to "="
   *   - `incomplete` incomplete character defaulting to "-"
   *   - `renderThrottle` minimum time between updates in milliseconds defaulting to 16
   *   - `callback` optional function to call when the progress bar completes
   *   - `clear` will clear the progress bar upon termination
   *
   * Tokens:
   *   - `:bar` the progress bar itself
   *   - `:current` current tick number
   *   - `:total` total ticks
   *   - `:elapsed` time elapsed in seconds
   *   - `:percent` completion percentage
   *   - `:eta` eta in seconds
   *   - `:rate` rate of ticks per second
   */
  constructor(private readonly format: string, options: any = {}) {
    this.stream = options.stream || process.stderr

    this.total = options.total
    this.width = options.width || this.total
    this.chars = {
      complete: options.complete || "=",
      incomplete: options.incomplete || "-",
      head: options.head || options.complete || "=",
    }
  }

  /**
   * "tick" the progress bar with optional `len` and optional `tokens`.
   */
  tick(delta: number) {
    this.currentAmount = this.current + delta
  }

  set currentAmount(value: number) {
    this.current = value

    if (this.complete) {
      return
    }

    this.render()

    if (this.current >= this.total) {
      this.complete = true
      this.terminate()
    }
  }

  render() {
    // start time for eta
    if (this.start === 0) {
      this.start = Date.now()
    }

    const ratio = Math.min(Math.max(this.current / this.total, 0), 1)

    const percent = ratio * 100
    const elapsed = Date.now() - this.start
    const eta = percent === 100 ? 0 : elapsed * (this.total / this.current - 1)
    const rate = this.current / (elapsed / 1000)

    /* populate the bar template with percentages and timestamps */
    let str = this.format
      .replace(":current", this.current.toString())
      .replace(":total", this.total.toString())
      .replace(":elapsed", isNaN(elapsed) ? "0.0" : (elapsed / 1000).toFixed(1))
      .replace(":eta", isNaN(eta) || !isFinite(eta) ? "0.0" : (eta / 1000).toFixed(1))
      .replace(":percent", percent.toFixed(0) + "%")
      .replace(":rate", Math.round(rate).toString())

    // compute the available space (non-zero) for the bar
    let availableSpace = Math.max(0, this.stream.columns - str.replace(":bar", "").length)
    if (availableSpace && process.platform === "win32") {
      availableSpace -= 1
    }

    const width = Math.min(this.width, availableSpace)
    const completeLength = Math.round(width * ratio)
    let complete = Array(Math.max(0, completeLength + 1)).join(this.chars.complete)
    const incomplete = Array(Math.max(0, width - completeLength + 1)).join(this.chars.incomplete)

    /* add head to the complete string */
    if (completeLength > 0) {
      complete = `${complete.slice(0, -1)}${this.chars.head}`
    }

    /* fill in the actual progress bar */
    str = str.replace(":bar", complete + incomplete)

    /* replace the extra tokens */
    if (this.tokens != null) {
      for (const key of Object.keys(this.tokens)) {
        str = str.replace(`:${key}`, this.tokens[key])
      }
    }

    if (this.lastDraw !== str) {
      this.stream.cursorTo(0)
      this.stream.write(str)
      this.stream.clearLine(1)
      this.lastDraw = str
    }
  }

  /**
   * "update" the progress bar to represent an exact percentage.
   * The ratio (between 0 and 1) specified will be multiplied by `total` and
   * floored, representing the closest available "tick." For example, if a
   * progress bar has a length of 3 and `update(0.5)` is called, the progress
   * will be set to 1.
   *
   * A ratio of 0.5 will attempt to set the progress to halfway.
   */
  update(ratio: number) {
    const goal = Math.floor(ratio * this.total)
    const delta = goal - this.current
    this.tick(delta)
  }

  /**
   * "interrupt" the progress bar and write a message above it.
   */
  interrupt(message: string) {
    // clear the current line
    const stream = this.stream
    stream.clearLine()
    // move the cursor to the start of the line
    stream.cursorTo(0)
    // write the message text
    stream.write(message)
    // terminate the line after writing the message
    stream.write("\n")
    // re-display the progress bar with its lastDraw
    stream.write(this.lastDraw)
  }

  abstract terminate(): void
}

export class ProgressCallback {
  private start = Date.now()
  private nextUpdate = this.start + 1000

  constructor(private readonly progressBar: ProgressBar) {}

  update(transferred: number, total: number) {
    const now = Date.now()
    if (now >= this.nextUpdate || transferred >= total) {
      this.nextUpdate = now + 1000

      this.progressBar.total = total
      this.progressBar.currentAmount = transferred
    }
  }
}
