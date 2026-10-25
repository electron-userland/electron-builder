import { TmpDir } from "builder-util/out/util"
import { CancellationToken } from "builder-util-runtime"
import { ElectronHttpExecutor } from "electron-updater/src/electronHttpExecutor"
import { EventEmitter } from "events"
import fsExtra from "fs-extra"
import type { RequestOptions } from "http"
import * as path from "path"
import { PassThrough } from "stream"
import { afterEach, describe, expect, test } from "vitest"

// ElectronHttpExecutor follows the redirects of its full downloads and of manual-redirect API requests (GitLab, private GitHub)
// itself, in a "redirect" event listener: a redirect it cannot follow must fail the request rather than throw from the listener.

const FILE_URL = "https://feed.example.com/updates/app-1.1.0.exe"
const TARGET_URL = "https://bucket.example.net/app-1.1.0.exe"
const FTP_URL = "ftp://files.example.net/app-1.1.0.exe"
const BODY = Buffer.from("update")
// without the fix, a redirect that cannot be followed leaves the request pending forever: fail fast instead
const GUARD_TIMEOUT = 10_000

// Stands in for Electron's net ClientRequest with `redirect: "manual"`: a redirect is reported as a "redirect" event (after which
// ElectronHttpExecutor aborts the request and sends a new one), anything else is answered with a 200 and BODY.
class FakeNetRequest extends EventEmitter {
  constructor(
    private readonly url: string,
    private readonly redirects: Record<string, string>
  ) {
    super()
  }

  end(): void {
    setImmediate(() => {
      const location = this.redirects[this.url]
      if (location != null) {
        this.emit("redirect", 302, "GET", location)
        return
      }
      const response = Object.assign(new PassThrough(), { statusCode: 200, headers: {} })
      this.emit("response", response)
      response.end(BODY)
    })
  }

  abort(): void {
    this.emit("abort")
  }
}

class FakeElectronHttpExecutor extends ElectronHttpExecutor {
  readonly sent: Array<string> = []
  /** createRequest throws for these URLs, as net.request does for options it cannot make a request of */
  readonly unrequestableUrls = new Set<string>()

  constructor(private readonly redirects: Record<string, string>) {
    super()
  }

  createRequest(options: RequestOptions, callback: (response: any) => void): any {
    const port = options.port == null ? "" : `:${options.port}`
    const url = `${options.protocol}//${options.hostname}${port}${options.path}`
    // like net.request, which throws (rather than failing the request) for a protocol other than http: and https:
    if (options.protocol !== "http:" && options.protocol !== "https:") {
      throw new Error(`Protocol "${options.protocol}" not supported`)
    }
    if (this.unrequestableUrls.has(url)) {
      throw new Error(`Cannot create a request for ${url}`)
    }
    this.sent.push(url)
    const request = new FakeNetRequest(url, this.redirects)
    request.on("response", callback)
    return request
  }
}

function apiRequestOptions(): RequestOptions {
  const url = new URL(FILE_URL)
  const options: RequestOptions & { redirect: "manual" } = { protocol: url.protocol, hostname: url.hostname, path: url.pathname, redirect: "manual" }
  return options
}

describe("ElectronHttpExecutor redirects", () => {
  const tmpDir = new TmpDir("electron-http-executor-redirect")
  afterEach(() => tmpDir.cleanup())

  async function destination(): Promise<string> {
    return path.join(await tmpDir.createTempDir({ prefix: "electron-http-executor-redirect" }), "app.exe")
  }

  for (const [label, redirects, error] of [
    ["to a protocol other than http(s)", { [FILE_URL]: FTP_URL }, 'Cannot follow the redirect to the "ftp:" protocol'],
    ["to a target that no request can be created for", { [FILE_URL]: TARGET_URL }, `Cannot create a request for ${TARGET_URL}`],
  ] as const) {
    test(
      `a redirect ${label} fails a download`,
      async () => {
        const executor = new FakeElectronHttpExecutor(redirects)
        executor.unrequestableUrls.add(TARGET_URL)
        await expect(executor.download(new URL(FILE_URL), await destination(), { cancellationToken: new CancellationToken() })).rejects.toThrow(error)
        expect(executor.sent).toEqual([FILE_URL])
      },
      GUARD_TIMEOUT
    )

    test(
      `a redirect ${label} fails an API request`,
      async () => {
        const executor = new FakeElectronHttpExecutor(redirects)
        executor.unrequestableUrls.add(TARGET_URL)
        await expect(executor.request(apiRequestOptions())).rejects.toThrow(error)
        expect(executor.sent).toEqual([FILE_URL])
      },
      GUARD_TIMEOUT
    )
  }

  // positive controls: the same redirect to an https target is followed
  test("a redirect to https is followed by a download", async () => {
    const executor = new FakeElectronHttpExecutor({ [FILE_URL]: TARGET_URL })
    const file = await destination()
    await executor.download(new URL(FILE_URL), file, { cancellationToken: new CancellationToken() })
    expect(await fsExtra.readFile(file)).toEqual(BODY)
    expect(executor.sent).toEqual([FILE_URL, TARGET_URL])
  })

  test("a redirect to https is followed by an API request", async () => {
    const executor = new FakeElectronHttpExecutor({ [FILE_URL]: TARGET_URL })
    expect(await executor.request(apiRequestOptions())).toBe(BODY.toString())
    expect(executor.sent).toEqual([FILE_URL, TARGET_URL])
  })
})
