import { CancellationToken } from "builder-util-runtime"
import fsExtra from "fs-extra"
import type { RequestOptions } from "http"
import * as path from "path"
import { describe, test } from "vitest"
import { FakeElectronHttpExecutor } from "../helpers/updaterTestUtil.js"

// ElectronHttpExecutor follows the redirects of its full downloads and of manual-redirect API requests (GitLab, private GitHub)
// itself, in a "redirect" event listener: a redirect it cannot follow must fail the request rather than throw from the listener.

const FILE_URL = "https://feed.example.com/updates/app-1.1.0.exe"
const TARGET_URL = "https://bucket.example.net/app-1.1.0.exe"
const FTP_URL = "ftp://files.example.net/app-1.1.0.exe"
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
