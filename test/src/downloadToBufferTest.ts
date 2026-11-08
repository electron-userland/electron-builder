import { ApiRequestOptions, CancellationToken, HttpError, HttpExecutor } from "builder-util-runtime"
import { EventEmitter } from "events"
import { describe, expect, test, vi } from "vitest"

class BufferExecutor extends HttpExecutor<any> {
  readonly response = Object.assign(new EventEmitter(), {
    statusCode: 200,
    statusMessage: "OK",
    headers: {},
    destroy: vi.fn(),
  })
  readonly requests: Array<{ abort: ReturnType<typeof vi.fn> }> = []

  createRequest(_options: unknown, callback: (response: any) => void) {
    const request = Object.assign(new EventEmitter(), {
      abort: vi.fn(),
      end: () => callback(this.response),
    })
    this.requests.push(request)
    return request
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

  await expect(download).rejects.toMatchObject({
    code: "ERR_UPDATER_DOWNLOAD_SIZE_EXCEEDED",
    message: "Response from https://example.com/update exceeds the maximum allowed size of 500 MB",
  })
  expect(executor.response.destroy).toHaveBeenCalledOnce()
  expect(executor.requests[0].abort).toHaveBeenCalledOnce()
})

test("fails a file download that has neither a destination nor a response handler", async () => {
  const executor = new BufferExecutor()
  const download = new Promise<void>((resolve, reject) => {
    // @ts-expect-error accessing a protected method
    executor.doDownload(
      { protocol: "https:", hostname: "example.com", path: "/update" },
      {
        destination: null,
        responseHandler: null,
        options: { cancellationToken: new CancellationToken() },
        onCancel: () => {},
        callback: (error: Error | null) => (error == null ? resolve() : reject(error)),
      },
      0
    )
  })

  await expect(download).rejects.toMatchObject({ code: "ERR_UPDATER_DOWNLOAD_DESTINATION_NOT_SET" })
})

test("rejects a failed download with an HttpError that leaves the query out of its message", async () => {
  const executor = new BufferExecutor()
  Object.assign(executor.response, { statusCode: 503, statusMessage: "Service Unavailable", resume: vi.fn() })
  const download = executor.downloadToBuffer(new URL("https://example.com/update.zip?sig=secret-sig&jwt=secret-jwt#frag"), {
    cancellationToken: new CancellationToken(),
  })

  const error = await download.catch((e: unknown) => e)
  expect(error).toBeInstanceOf(HttpError)
  expect(error).toMatchObject({ statusCode: 503, code: "HTTP_ERROR_503", message: 'Cannot download "https://example.com/update.zip", status 503: Service Unavailable' })
  expect(error instanceof HttpError && error.isServerError()).toBe(true)
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

test("stops a buffer download once it passes a smaller maxSize, and aborts its request", async () => {
  const executor = new BufferExecutor()
  const download = executor.downloadToBuffer(new URL("https://example.com/update.blockmap?X-Amz-Signature=secret"), {
    cancellationToken: new CancellationToken(),
    maxSize: 10,
  })

  executor.response.emit("data", Buffer.alloc(6))
  executor.response.emit("data", Buffer.alloc(5))
  executor.response.emit("data", Buffer.from("ignored"))
  executor.response.emit("end")

  await expect(download).rejects.toMatchObject({
    code: "ERR_UPDATER_DOWNLOAD_SIZE_EXCEEDED",
    message: "Response from https://example.com/update.blockmap exceeds the maximum allowed size of 10 bytes",
  })
  expect(executor.response.destroy).toHaveBeenCalledOnce()
  // destroying the response of Electron's net does not end its request: only abort() does
  expect(executor.requests[0].abort).toHaveBeenCalledOnce()
})

test("accepts a buffer download of exactly maxSize bytes", async () => {
  const executor = new BufferExecutor()
  const download = executor.downloadToBuffer(new URL("https://example.com/update.blockmap"), { cancellationToken: new CancellationToken(), maxSize: 10 })

  executor.response.emit("data", Buffer.alloc(6, 1))
  executor.response.emit("data", Buffer.alloc(4, 2))
  executor.response.emit("end")

  await expect(download).resolves.toEqual(Buffer.concat([Buffer.alloc(6, 1), Buffer.alloc(4, 2)]))
  expect(executor.response.destroy).not.toHaveBeenCalled()
  expect(executor.requests[0].abort).not.toHaveBeenCalled()
})

test("a maxSize of 0 accepts only an empty response", async () => {
  const empty = new BufferExecutor()
  const emptyDownload = empty.downloadToBuffer(new URL("https://example.com/update.blockmap"), { cancellationToken: new CancellationToken(), maxSize: 0 })
  empty.response.emit("end")
  await expect(emptyDownload).resolves.toEqual(Buffer.alloc(0))

  const executor = new BufferExecutor()
  const download = executor.downloadToBuffer(new URL("https://example.com/update.blockmap"), { cancellationToken: new CancellationToken(), maxSize: 0 })
  executor.response.emit("data", Buffer.alloc(1))
  await expect(download).rejects.toMatchObject({ code: "ERR_UPDATER_DOWNLOAD_SIZE_EXCEEDED" })
  expect(executor.requests[0].abort).toHaveBeenCalledOnce()
})

// only a number of at least 0 is a limit (see DownloadOptions.maxSize), and none is above 500 MB
test.for([
  { name: "NaN", maxSize: Number.NaN },
  { name: "negative", maxSize: -1 },
  { name: "numeric string", maxSize: "10" },
  { name: "larger than 500 MB", maxSize: 2 * 524288000 },
])("a $name maxSize keeps the 500 MB limit", async ({ maxSize }) => {
  const executor = new BufferExecutor()
  const download = executor.downloadToBuffer(new URL("https://example.com/update"), { cancellationToken: new CancellationToken(), maxSize: maxSize as unknown as number })

  executor.response.emit("data", Buffer.alloc(11))
  executor.response.emit("data", { length: 524288000 - 11 })
  executor.response.emit("data", { length: 1 })
  executor.response.emit("end")

  await expect(download).rejects.toThrow("exceeds the maximum allowed size of 500 MB")
  expect(executor.response.destroy).toHaveBeenCalledOnce()
})

test("keeps maxSize on a redirect", async () => {
  const redirect = Object.assign(new EventEmitter(), { statusCode: 302, statusMessage: "Found", headers: { location: "https://cdn.example.com/update.blockmap" }, resume: vi.fn() })
  const response = Object.assign(new EventEmitter(), { statusCode: 200, statusMessage: "OK", headers: {}, destroy: vi.fn() })
  const requests: Array<{ hostname: string | null | undefined; abort: ReturnType<typeof vi.fn> }> = []
  const executor = new (class extends HttpExecutor<any> {
    createRequest(options: { hostname?: string | null }, callback: (response: any) => void) {
      const request = Object.assign(new EventEmitter(), { abort: vi.fn(), end: () => callback(requests.length === 1 ? redirect : response) })
      requests.push({ hostname: options.hostname, abort: request.abort })
      return request
    }
  })()
  const download = executor.downloadToBuffer(new URL("https://example.com/update.blockmap"), { cancellationToken: new CancellationToken(), maxSize: 10 })

  response.emit("data", Buffer.alloc(11))

  await expect(download).rejects.toMatchObject({ code: "ERR_UPDATER_DOWNLOAD_SIZE_EXCEEDED" })
  expect(requests.map(it => it.hostname)).toEqual(["example.com", "cdn.example.com"])
  expect(requests[1].abort).toHaveBeenCalledOnce()
})
