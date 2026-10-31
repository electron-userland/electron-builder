import { CancellationToken } from "builder-util-runtime"
import fsExtra from "fs-extra"
import type { RequestOptions } from "http"
import * as path from "path"
import type { TmpDir } from "temp-file"
import { describe, test } from "vitest"
import { FakeElectronHttpExecutor, FakeNetRequest } from "../helpers/updaterTestUtil.js"

// ElectronHttpExecutor follows the redirects of its full downloads and of manual-redirect API requests (GitLab, private GitHub)
// itself, in a "redirect" event listener: a redirect it cannot follow must fail the request rather than throw from the listener.

const FILE_URL = "https://feed.example.com/updates/app-1.1.0.exe"
const TARGET_URL = "https://bucket.example.net/app-1.1.0.exe"
const FTP_URL = "ftp://files.example.net/app-1.1.0.exe"
const UNPARSEABLE_URL = "http://files.example .net/app-1.1.0.exe"
const BODY = Buffer.from("update")
// without the fix, a redirect that cannot be followed leaves the request pending forever: fail fast instead
const GUARD_TIMEOUT = 10_000

function createExecutor(redirects: Record<string, string>): FakeElectronHttpExecutor {
  return new FakeElectronHttpExecutor(url => {
    const location = redirects[url]
    return location == null ? { statusCode: 200, body: BODY } : { location }
  })
}

function apiRequestOptions(): RequestOptions {
  const url = new URL(FILE_URL)
  const options: RequestOptions & { redirect: "manual" } = { protocol: url.protocol, hostname: url.hostname, path: url.pathname, redirect: "manual" }
  return options
}

describe("ElectronHttpExecutor redirects", () => {
  for (const [label, redirects, error] of [
    ["to a protocol other than http(s)", { [FILE_URL]: FTP_URL }, 'Cannot follow the redirect to the "ftp:" protocol'],
    ["to a target that no request can be created for", { [FILE_URL]: TARGET_URL }, `Cannot create a request for ${TARGET_URL}`],
  ] as const) {
    test(
      `a redirect ${label} fails a download`,
      async ({ tmpDir, expect }) => {
        const executor = createExecutor(redirects)
        executor.unrequestableUrls.add(TARGET_URL)
        const destination = path.join(await tmpDir.createTempDir({ prefix: "electron-http-executor-redirect" }), "app.exe")
        await expect(executor.download(new URL(FILE_URL), destination, { cancellationToken: new CancellationToken() })).rejects.toThrow(error)
        expect(executor.sent.map(it => it.url)).toEqual([FILE_URL])
      },
      GUARD_TIMEOUT
    )

    test(
      `a redirect ${label} fails an API request`,
      async ({ expect }) => {
        const executor = createExecutor(redirects)
        executor.unrequestableUrls.add(TARGET_URL)
        await expect(executor.request(apiRequestOptions())).rejects.toThrow(error)
        expect(executor.sent.map(it => it.url)).toEqual([FILE_URL])
      },
      GUARD_TIMEOUT
    )
  }

  // positive controls: the same redirect to an https target is followed
  test("a redirect to https is followed by a download", async ({ tmpDir, expect }) => {
    const executor = createExecutor({ [FILE_URL]: TARGET_URL })
    const destination = path.join(await tmpDir.createTempDir({ prefix: "electron-http-executor-redirect" }), "app.exe")
    await executor.download(new URL(FILE_URL), destination, { cancellationToken: new CancellationToken() })
    expect(await fsExtra.readFile(destination)).toEqual(BODY)
    expect(executor.sent.map(it => it.url)).toEqual([FILE_URL, TARGET_URL])
  })

  test("a redirect to https is followed by an API request", async ({ expect }) => {
    const executor = createExecutor({ [FILE_URL]: TARGET_URL })
    expect(await executor.request(apiRequestOptions())).toBe(BODY.toString())
    expect(executor.sent.map(it => it.url)).toEqual([FILE_URL, TARGET_URL])
  })
})

// Electron reports only 301/302/303/307/308 as "redirect" events: a Location on any other response reaches the response listener
// of a download, which follows it only for a 3xx status, and must fail the download (rather than throw from the listener) when it
// cannot follow it.

function createResponseExecutor(statusCode: number, location: string): FakeElectronHttpExecutor {
  return new FakeElectronHttpExecutor(url => (url === FILE_URL ? { statusCode, headers: { location }, body: BODY } : { statusCode: 200, body: BODY }))
}

const DOWNLOADS: ReadonlyArray<readonly [string, (executor: FakeElectronHttpExecutor, tmpDir: TmpDir) => Promise<Buffer>]> = [
  [
    "a download",
    async (executor, tmpDir) => {
      const destination = path.join(await tmpDir.createTempDir({ prefix: "electron-http-executor-redirect" }), "app.exe")
      await executor.download(new URL(FILE_URL), destination, { cancellationToken: new CancellationToken() })
      return await fsExtra.readFile(destination)
    },
  ],
  ["a download to a buffer", executor => executor.downloadToBuffer(new URL(FILE_URL), { cancellationToken: new CancellationToken() })],
]

describe("ElectronHttpExecutor Location on a response", () => {
  for (const [kind, download] of DOWNLOADS) {
    for (const [label, location, error] of [
      ["to a protocol other than http(s)", FTP_URL, 'Cannot follow the redirect to the "ftp:" protocol'],
      ["that is not a valid URL", UNPARSEABLE_URL, "Invalid URL"],
    ] as const) {
      test(
        `a 300 response with a Location ${label} fails ${kind}`,
        async ({ tmpDir, expect }) => {
          const executor = createResponseExecutor(300, location)
          await expect(download(executor, tmpDir)).rejects.toThrow(error)
          expect(executor.sent.map(it => it.url)).toEqual([FILE_URL])
        },
        GUARD_TIMEOUT
      )
    }

    test(
      `a 300 response with a Location to https is followed by ${kind}`,
      async ({ tmpDir, expect }) => {
        const executor = createResponseExecutor(300, TARGET_URL)
        expect(await download(executor, tmpDir)).toEqual(BODY)
        expect(executor.sent.map(it => it.url)).toEqual([FILE_URL, TARGET_URL])
      },
      GUARD_TIMEOUT
    )

    test(
      `a 200 response with a Location is not a redirect: ${kind} keeps its body`,
      async ({ tmpDir, expect }) => {
        const executor = createResponseExecutor(200, FTP_URL)
        expect(await download(executor, tmpDir)).toEqual(BODY)
        expect(executor.sent.map(it => it.url)).toEqual([FILE_URL])
      },
      GUARD_TIMEOUT
    )
  }
})

// A cancel aborts the request in flight: after a redirect event, that is the request sent to the redirect's target, not the first one.
describe("ElectronHttpExecutor cancel after a redirect", () => {
  // redirects FILE_URL to TARGET_URL, whose request it never answers
  class StallingTargetExecutor extends FakeElectronHttpExecutor {
    private onTargetRequest: (request: FakeNetRequest) => void = () => {}
    // settles once the request to the target is created, sent and given its cancel handler (all synchronous in doDownload)
    readonly targetRequest = new Promise<FakeNetRequest>(resolve => {
      this.onTargetRequest = resolve
    })

    constructor() {
      super(() => ({ location: TARGET_URL }))
    }

    createRequest(options: RequestOptions, callback: (response: any) => void): any {
      if (`${options.protocol}//${options.hostname}${options.path}` !== TARGET_URL) {
        return super.createRequest(options, callback)
      }
      const request = new FakeNetRequest({ url: TARGET_URL })
      request.on("response", callback)
      this.onTargetRequest(request)
      return request
    }
  }

  test("a cancel aborts the request of the redirect", async ({ tmpDir, expect }) => {
    const destination = path.join(await tmpDir.createTempDir({ prefix: "electron-http-executor-redirect" }), "app.exe")
    const executor = new StallingTargetExecutor()
    const cancellationToken = new CancellationToken()
    const download = executor.download(new URL(FILE_URL), destination, { cancellationToken })
    const targetRequest = await executor.targetRequest
    expect(targetRequest.aborted).toBe(false)

    cancellationToken.cancel()
    await expect(download).rejects.toThrow("cancelled")
    expect(targetRequest.aborted).toBe(true)
  })
})
