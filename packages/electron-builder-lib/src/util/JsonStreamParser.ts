enum ReadState {
  HEADER, BODY
}

export class JsonStreamParser {
  private state = ReadState.HEADER
  private buffer = ""
  private remainingMessageLength = 0

  constructor(private readonly eventHandler: (data: any) => void) {
  }

  // https://github.com/EventSource/eventsource/blob/master/lib/eventsource.js
  parseIncoming(chunk: string) {
    let offset = 0
    while (offset < chunk.length) {
      if (this.state === ReadState.HEADER) {
        if (chunk.length === 1 && chunk[0] === " ") {
          // ping
          return
        }

        for (let i = offset; i < chunk.length; i++) {
          if (chunk[i] === "{") {
            this.buffer += chunk.substring(0, i)
            this.remainingMessageLength = parseInt(this.buffer.trim(), 10)
            this.buffer = ""
            offset = i
            this.state = ReadState.BODY
            break
          }
        }
      }

      const end = offset + this.remainingMessageLength
      this.buffer += chunk.substring(offset, Math.min(chunk.length, end))
      this.remainingMessageLength -= chunk.length - offset
      if (this.remainingMessageLength > 0) {
        return
      }

      offset = end
      this.remainingMessageLength = 0
      this.state = ReadState.HEADER
      const data = JSON.parse(this.buffer)
      this.buffer = ""

      this.eventHandler(data)
    }
  }
}