import { CancellationToken } from "builder-util-runtime"
import { ElectronHttpExecutor } from "electron-updater/src/electronHttpExecutor"
import { EventEmitter } from "events"
import type { RequestOptions } from "http"
import { PassThrough } from "stream"
import { describe, expect, test } from "vitest"

// Electron's net reports a redirect as a "redirect" event: ElectronHttpExecutor aborts the request and sends a new one to the
// target. The redirects it follows this way must be counted, so a redirect loop fails instead of being followed forever.

const MAX_REDIRECTS = 10
// without the fix the redirect count never grows: the fake stops redirecting after this many requests, so such a test fails
// fast instead of hanging
const RUNAWAY_LIMIT = 100

// https://feed.example.com/a and /b redirect to each other; /chain/<n> redirects to /chain/<n + 1> until /chain/<end>
function redirectTarget(url: URL): string | null {
  if (url.pathname === "/a") {
    return "https://feed.example.com/b"
  }
  if (url.pathname === "/b") {
    return "https://feed.example.com/a"
  }
  const chain = /^\/chain\/(\d+)$/.exec(url.pathname)
  if (chain == null) {
    return null
  }
  const hop = Number(chain[1])
  const end = Number(url.searchParams.get("end"))
  return hop < end ? `https://feed.example.com/chain/${hop + 1}?end=${end}` : null
}

// Stands in for Electron's net ClientRequest with `redirect: "manual"`: a redirect is reported as a "redirect" event, anything
// else is answered with a 200 and "done"
class FakeNetRequest extends EventEmitter {
  constructor(
    private readonly url: URL,
    private readonly redirectAllowed: boolean
  ) {
    super()
  }

  end(): void {
    setImmediate(() => {
      const location = this.redirectAllowed ? redirectTarget(this.url) : null
      if (location != null) {
        this.emit("redirect", 302, "GET", location)
        return
      }
      const response = Object.assign(new PassThrough(), { statusCode: 200, headers: {} })
      this.emit("response", response)
      response.end(this.redirectAllowed ? "done" : "redirects were not limited")
    })
  }

  abort(): void {
    this.emit("abort")
  }
}

class FakeElectronHttpExecutor extends ElectronHttpExecutor {
  readonly sent: Array<string> = []

  // returns the fake in place of Electron's ClientRequest
  createRequest(options: RequestOptions, callback: (response: any) => void): any {
    const url = new URL(`${options.protocol}//${options.hostname}${options.path}`)
    this.sent.push(url.pathname)
    const request = new FakeNetRequest(url, this.sent.length <= RUNAWAY_LIMIT)
    request.on("response", callback)
    return request
  }
}

function apiRequest(executor: FakeElectronHttpExecutor, path: string): Promise<string> {
  const options: RequestOptions & { redirect: "manual" } = { protocol: "https:", hostname: "feed.example.com", path, redirect: "manual" }
  return executor.doApiRequest(options, new CancellationToken(), request => request.end())
}

async function download(executor: FakeElectronHttpExecutor, path: string): Promise<string> {
  const buffer = await executor.downloadToBuffer(new URL(`https://feed.example.com${path}`), { cancellationToken: new CancellationToken() })
  return buffer.toString()
}

// maxRedirects redirects are followed, like the Node.js path: the original request plus one per redirect
const REQUESTS_AT_LIMIT = MAX_REDIRECTS + 1

describe("ElectronHttpExecutor redirect limit", () => {
  for (const [name, run] of [
    ["doApiRequest", apiRequest],
    ["doDownload", download],
  ] as const) {
    describe(name, () => {
      test("an A -> B -> A redirect loop fails with Too many redirects", async () => {
        const executor = new FakeElectronHttpExecutor()
        await expect(run(executor, "/a")).rejects.toThrow(/Too many redirects/)
        expect(executor.sent).toHaveLength(REQUESTS_AT_LIMIT)
      })

      test("a chain of more than maxRedirects redirects fails with Too many redirects", async () => {
        const executor = new FakeElectronHttpExecutor()
        await expect(run(executor, `/chain/0?end=${MAX_REDIRECTS + 5}`)).rejects.toThrow(/Too many redirects/)
        expect(executor.sent).toHaveLength(REQUESTS_AT_LIMIT)
      })

      test("a chain of exactly maxRedirects redirects is followed", async () => {
        const executor = new FakeElectronHttpExecutor()
        await expect(run(executor, `/chain/0?end=${MAX_REDIRECTS}`)).resolves.toBe("done")
        expect(executor.sent).toHaveLength(MAX_REDIRECTS + 1)
      })
    })
  }
})
