import { CancellationToken, HttpExecutor } from "builder-util-runtime"
import { RequestOptions } from "http"
import { expect, test, vi } from "vitest"

function response(statusCode: number, location?: string) {
  return {
    statusCode,
    statusMessage: "status",
    headers: location == null ? {} : { location },
    on() {},
    resume: vi.fn(),
    setEncoding() {},
  }
}

class ResponseExecutor extends HttpExecutor<any> {
  constructor(readonly responses: ReturnType<typeof response>[]) {
    super()
  }

  createRequest(_options: RequestOptions, callback: (response: any) => void) {
    const nextResponse = this.responses.shift()
    return {
      abort() {},
      end: () => callback(nextResponse),
      on() {},
    }
  }

  runDownload(callback: (error: Error | null) => void) {
    this.doDownload(
      { protocol: "https:", hostname: "example.com", path: "/update" },
      { responseHandler: null, onCancel: () => {}, callback, options: {} as any, destination: null },
      0
    )
  }
}

test("drains an API response rejected before reading its body", async () => {
  const rejectedResponse = response(404)
  const executor = new ResponseExecutor([rejectedResponse])

  await expect(executor.doApiRequest({ protocol: "https:", hostname: "example.com", path: "/missing" }, new CancellationToken(), request => request.end())).rejects.toThrow()
  expect(rejectedResponse.resume).toHaveBeenCalledOnce()
})

test("drains an API redirect before following it", async () => {
  const redirectResponse = response(302, "https://example.com/final")
  const finalResponse = response(204)
  const executor = new ResponseExecutor([redirectResponse, finalResponse])

  await executor.doApiRequest({ protocol: "https:", hostname: "example.com", path: "/start" }, new CancellationToken(), request => request.end())

  expect(redirectResponse.resume).toHaveBeenCalledOnce()
  expect(finalResponse.resume).toHaveBeenCalledOnce()
})

test("drains a failed download response", () => {
  const rejectedResponse = response(500)
  const executor = new ResponseExecutor([rejectedResponse])
  let error: Error | null = null

  executor.runDownload(result => {
    error = result
  })

  expect(error).toBeInstanceOf(Error)
  expect(rejectedResponse.resume).toHaveBeenCalledOnce()
})
