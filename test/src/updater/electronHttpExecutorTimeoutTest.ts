import { ElectronHttpExecutor } from "electron-updater/src/electronHttpExecutor"
import { EventEmitter } from "events"
import { afterEach, beforeEach, describe, test, vi } from "vitest"

// Stands in for Electron's net ClientRequest: like the real one it never emits "socket", and with autoDestroy it emits "close"
// as soon as the request body is sent, long before the response.
class FakeNetRequest extends EventEmitter {
  aborted = false

  abort(): void {
    this.aborted = true
    this.emit("abort")
  }
}

const TIMEOUT = 1000

describe("ElectronHttpExecutor request timeout", { concurrent: false }, () => {
  let request: FakeNetRequest
  let errors: Array<Error>

  beforeEach(() => {
    vi.useFakeTimers()
    request = new FakeNetRequest()
    errors = []
    new ElectronHttpExecutor().addErrorAndTimeoutHandlers(request, error => errors.push(error), TIMEOUT)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // stands in for Electron's net IncomingMessage
  function respond(): EventEmitter {
    const response = new EventEmitter()
    request.emit("response", response)
    return response
  }

  test("a request that gets no response times out (the request body being sent does not count)", ({ expect }) => {
    request.emit("finish")
    request.emit("close")
    vi.advanceTimersByTime(TIMEOUT - 1)
    expect(errors).toHaveLength(0)
    vi.advanceTimersByTime(1)
    expect(errors.map(it => it.message)).toEqual(["Request timed out"])
    expect(request.aborted).toBe(true)
  })

  test("a response body that stalls times out, while one that keeps flowing does not", ({ expect }) => {
    vi.advanceTimersByTime(TIMEOUT - 1)
    const response = respond()
    for (let i = 0; i < 5; i++) {
      vi.advanceTimersByTime(TIMEOUT - 1)
      response.emit("data", Buffer.alloc(10))
    }
    expect(errors).toHaveLength(0)
    vi.advanceTimersByTime(TIMEOUT)
    expect(errors.map(it => it.message)).toEqual(["Request timed out"])
    expect(request.aborted).toBe(true)
  })

  test("a redirect restarts the timer", ({ expect }) => {
    vi.advanceTimersByTime(TIMEOUT - 1)
    request.emit("redirect", 302, "GET", "https://example.com/other")
    vi.advanceTimersByTime(TIMEOUT - 1)
    expect(errors).toHaveLength(0)
    vi.advanceTimersByTime(1)
    expect(errors).toHaveLength(1)
  })

  test("nothing times out after the response ended", ({ expect }) => {
    const response = respond()
    response.emit("data", Buffer.alloc(10))
    response.emit("end")
    vi.advanceTimersByTime(10 * TIMEOUT)
    expect(errors).toHaveLength(0)
    expect(request.aborted).toBe(false)
  })

  test("nothing times out after the request failed or was aborted", ({ expect }) => {
    request.emit("error", new Error("net::ERR_CONNECTION_RESET"))
    vi.advanceTimersByTime(10 * TIMEOUT)
    // only the base class's error handler reported it
    expect(errors.map(it => it.message)).toEqual(["net::ERR_CONNECTION_RESET"])

    const aborted = new FakeNetRequest()
    const abortedErrors: Array<Error> = []
    new ElectronHttpExecutor().addErrorAndTimeoutHandlers(aborted, error => abortedErrors.push(error), TIMEOUT)
    aborted.abort()
    vi.advanceTimersByTime(10 * TIMEOUT)
    expect(abortedErrors).toHaveLength(0)
  })

  test("a timeout of 0 disables it, like socket.setTimeout(0)", ({ expect }) => {
    const unlimited = new FakeNetRequest()
    const unlimitedErrors: Array<Error> = []
    new ElectronHttpExecutor().addErrorAndTimeoutHandlers(unlimited, error => unlimitedErrors.push(error), 0)
    vi.advanceTimersByTime(10 * 60 * 1000)
    expect(unlimitedErrors).toHaveLength(0)
    expect(unlimited.aborted).toBe(false)
  })
})
