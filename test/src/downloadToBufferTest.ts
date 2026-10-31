import { ApiRequestOptions, CancellationToken, HttpExecutor } from "builder-util-runtime"
import { EventEmitter } from "events"
import { describe, expect, test, vi } from "vitest"

class BufferExecutor extends HttpExecutor<any> {
  readonly response = Object.assign(new EventEmitter(), {
    statusCode: 200,
    statusMessage: "OK",
    headers: {},
    destroy: vi.fn(),
  })

  createRequest(_options: unknown, callback: (response: any) => void) {
    return Object.assign(new EventEmitter(), {
      abort: vi.fn(),
      end: () => callback(this.response),
    })
  }
}

test("stops reading a buffer download after the size limit", async () => {
  const executor = new BufferExecutor()
  const download = executor.downloadToBuffer(new URL("https://example.com/update"), {
    cancellationToken: new CancellationToken(),
  })

  executor.response.emit("data", { length: 524288001 })
  executor.response.emit("data", Buffer.from("ignored"))
  executor.response.emit("end")

  await expect(download).rejects.toThrow("Maximum allowed size is 500 MB")
  expect(executor.response.destroy).toHaveBeenCalledOnce()
})

describe("API request size limit (maxResponseSize)", () => {
  function fakeResponse(statusCode = 200, headers: Record<string, string> = {}) {
    return Object.assign(new EventEmitter(), { statusCode, statusMessage: "", headers, setEncoding: vi.fn() })
  }

  // answers the n-th request with the n-th response, on which the test then emits the body
  class ApiExecutor extends HttpExecutor<any> {
    readonly requests: Array<{ options: ApiRequestOptions; abort: ReturnType<typeof vi.fn> }> = []

    constructor(private readonly responses: Array<ReturnType<typeof fakeResponse>>) {
      super()
    }

    createRequest(options: ApiRequestOptions, callback: (response: any) => void) {
      const response = this.responses[this.requests.length]
      const request = Object.assign(new EventEmitter(), { abort: vi.fn(), end: () => callback(response) })
      this.requests.push({ options, abort: request.abort })
      return request
    }
  }

  const options = (maxResponseSize?: number): ApiRequestOptions => ({ protocol: "https:", hostname: "example.com", path: "/latest.yml", maxResponseSize })

  test("fails and aborts a request whose response is larger than the limit", async () => {
    const response = fakeResponse()
    const executor = new ApiExecutor([response])
    const result = executor.request(options(1024))

    // nothing is thrown from the stream's listeners: the size error rejects the request
    expect(() => {
      response.emit("data", "a".repeat(600))
      response.emit("data", "a".repeat(600))
      response.emit("data", "a".repeat(600))
      response.emit("end")
    }).not.toThrow()

    await expect(result).rejects.toMatchObject({ code: "ERR_HTTP_RESPONSE_TOO_LARGE" })
    expect(executor.requests[0].abort).toHaveBeenCalledOnce()
  })

  test("reads a response up to the limit", async () => {
    const response = fakeResponse()
    const executor = new ApiExecutor([response])
    const result = executor.request(options(1024))

    response.emit("data", "a".repeat(1000))
    response.emit("data", "a".repeat(24))
    response.emit("end")

    await expect(result).resolves.toBe("a".repeat(1024))
    expect(executor.requests[0].abort).not.toHaveBeenCalled()
  })

  test("keeps the limit on a redirect", async () => {
    const redirect = fakeResponse(302, { location: "https://cdn.example.com/latest.yml" })
    const response = fakeResponse()
    const executor = new ApiExecutor([redirect, response])
    const result = executor.request(options(1024))

    response.emit("data", "a".repeat(2048))
    response.emit("end")

    await expect(result).rejects.toMatchObject({ code: "ERR_HTTP_RESPONSE_TOO_LARGE" })
    expect(executor.requests).toHaveLength(2)
    expect(executor.requests[1].options.maxResponseSize).toBe(1024)
    expect(executor.requests[1].abort).toHaveBeenCalledOnce()
  })

  test("names the URL without its query in the error", async () => {
    const response = fakeResponse()
    const executor = new ApiExecutor([response])
    const result = executor.request({ ...options(10), path: "/latest.yml?X-Amz-Signature=secret" })

    response.emit("data", "a".repeat(11))

    const error = await result.catch((e: unknown) => e)
    expect(error).toBeInstanceOf(Error)
    expect(error).toMatchObject({ code: "ERR_HTTP_RESPONSE_TOO_LARGE", message: "Response from https://example.com/latest.yml exceeds the maximum allowed size of 10 bytes" })
  })

  // a limit that is not a finite number of at least 0 is not applied
  test.each([-1, Number.NaN, Number.POSITIVE_INFINITY])("reads the whole response when the limit is %s", async maxResponseSize => {
    const response = fakeResponse()
    const executor = new ApiExecutor([response])
    const result = executor.request(options(maxResponseSize))

    response.emit("data", "a".repeat(1024))
    response.emit("end")

    await expect(result).resolves.toBe("a".repeat(1024))
    expect(executor.requests[0].abort).not.toHaveBeenCalled()
  })

  test("reads the whole response when no limit is set", async () => {
    const response = fakeResponse()
    const executor = new ApiExecutor([response])
    const result = executor.request(options())

    const chunk = "a".repeat(1024 * 1024)
    response.emit("data", chunk)
    response.emit("data", chunk)
    response.emit("end")

    await expect(result).resolves.toHaveLength(2 * chunk.length)
    expect(executor.requests[0].abort).not.toHaveBeenCalled()
  })
})
