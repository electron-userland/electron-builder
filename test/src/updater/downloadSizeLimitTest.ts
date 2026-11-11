import { CancellationToken, configureRequestOptions, configureRequestUrl, HttpExecutor } from "builder-util-runtime"
import { serializeToYaml } from "builder-util"
import { createHash } from "crypto"
import fs from "fs"
import fsExtra from "fs-extra"
import * as http from "http"
import type { IncomingMessage } from "http"
import type { Socket } from "net"
import * as path from "path"
import { describe, test, vi } from "vitest"
import { createNsisUpdater, FakeElectronHttpExecutor, FakeNetRequest, writeUpdateConfig } from "../helpers/updaterTestUtil.js"

// A full download into a file stops once it receives more bytes than the size the update info declares for the file.

const sha512 = (data: Buffer) => createHash("sha512").update(data).digest("base64")

// HttpExecutor.doDownload with responseHandler null, like ElectronHttpExecutor.download, over plain http.request (the server is local)
class LocalDownloadExecutor extends HttpExecutor<http.ClientRequest> {
  createRequest(options: http.RequestOptions, callback: (response: IncomingMessage) => void): http.ClientRequest {
    return http.request(options, callback)
  }

  download(url: URL, destination: string, options: { sha512?: string; maxSize?: number | null }): Promise<string> {
    const cancellationToken = new CancellationToken()
    return cancellationToken.createPromise<string>((resolve, reject, onCancel) => {
      const requestOptions: http.RequestOptions = {}
      configureRequestUrl(url, requestOptions)
      configureRequestOptions(requestOptions)
      this.doDownload(
        requestOptions,
        {
          destination,
          options: { ...options, cancellationToken },
          onCancel,
          callback: error => (error == null ? resolve(destination) : reject(error)),
          responseHandler: null,
        },
        0
      )
    })
  }
}

async function withServer(onRequest: (response: http.ServerResponse) => void, task: (url: URL) => Promise<void>): Promise<void> {
  const sockets = new Set<Socket>()
  const server = http.createServer((_request, response) => onRequest(response))
  server.on("connection", socket => {
    sockets.add(socket)
    socket.on("close", () => sockets.delete(socket))
  })
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve))
  const address = server.address()
  if (address == null || typeof address === "string") {
    throw new Error("server has no port")
  }
  try {
    await task(new URL(`http://127.0.0.1:${address.port}/update.exe`))
  } finally {
    for (const socket of sockets) {
      socket.destroy()
    }
    await new Promise(resolve => server.close(resolve))
  }
}

describe("HttpExecutor download maxSize", () => {
  const MAX_SIZE = 64 * 1024

  test("a body far larger than maxSize is stopped once it exceeds maxSize, before the server has sent it", async ({ expect, tmpDir }) => {
    const dir = await tmpDir.getTempDir({ prefix: "download-size-limit" })
    await fsExtra.ensureDir(dir)
    const destination = path.join(dir, "oversized.exe")
    const chunk = Buffer.alloc(16 * 1024, 1)
    const chunkCount = (16 * MAX_SIZE) / chunk.length
    let isClosedBeforeEnd: boolean | null = null
    // no Content-Length: one chunk at a time, like a server that streams for as long as the client reads
    const sendSlowly = (response: http.ServerResponse) => {
      response.writeHead(200, { "Content-Type": "application/octet-stream" })
      let sentCount = 0
      const timer = setInterval(() => {
        if (++sentCount < chunkCount) {
          response.write(chunk)
        } else {
          clearInterval(timer)
          response.end(chunk)
        }
      }, 5)
      response.on("close", () => {
        clearInterval(timer)
        isClosedBeforeEnd = !response.writableFinished
      })
    }
    await withServer(sendSlowly, async url => {
      await expect(new LocalDownloadExecutor().download(url, destination, { sha512: sha512(Buffer.alloc(0)), maxSize: MAX_SIZE })).rejects.toMatchObject({
        code: "ERR_UPDATER_DOWNLOAD_SIZE_EXCEEDED",
        message: expect.stringContaining(`${MAX_SIZE} bytes`),
      })
      await expect.poll(() => isClosedBeforeEnd).toBe(true)
      expect((await fsExtra.stat(destination)).size).toBeLessThanOrEqual(MAX_SIZE)
    })
  })

  // createWriteStream opens the destination asynchronously, so a body that passes maxSize before that open has finished fails the download
  // while the file does not exist yet. The failure must be reported once the destination is closed: a caller that removes the partly
  // written file on the failure (electron-updater empties pending/) would otherwise run before the open creates it, and leave it behind
  test("a body that passes maxSize before the destination is open fails only once the destination is closed", async ({ expect, tmpDir }) => {
    const dir = await tmpDir.getTempDir({ prefix: "download-size-limit" })
    await fsExtra.ensureDir(dir)
    const destination = path.join(dir, "slow-open.exe")
    // hold the open of the destination back, as a busy disk or thread pool does
    const realOpen = fs.open
    const openSpy = vi.spyOn(fs, "open").mockImplementation(((...args: Array<any>) => {
      if (args[0] === destination) {
        setTimeout(() => (realOpen as any)(...args), 300)
      } else {
        ;(realOpen as any)(...args)
      }
    }) as any)
    try {
      await withServer(
        response => response.end(Buffer.alloc(MAX_SIZE + 1, 5)),
        async url => {
          await expect(new LocalDownloadExecutor().download(url, destination, { maxSize: MAX_SIZE })).rejects.toMatchObject({ code: "ERR_UPDATER_DOWNLOAD_SIZE_EXCEEDED" })
          // what electron-updater does on the failure: remove the partly written file with the rest of the pending update
          await fsExtra.remove(destination)
        }
      )
      // well after the held-back open has run
      await new Promise(resolve => setTimeout(resolve, 600))
      expect(fs.existsSync(destination)).toBe(false)
    } finally {
      openSpy.mockRestore()
    }
  })

  test("a body of exactly maxSize downloads; without maxSize, or with a negative one, a larger body is not limited", async ({ expect, tmpDir }) => {
    const dir = await tmpDir.getTempDir({ prefix: "download-size-limit" })
    await fsExtra.ensureDir(dir)
    const exact = Buffer.alloc(MAX_SIZE, 2)
    await withServer(
      response => response.end(exact),
      async url => {
        const destination = path.join(dir, "exact.exe")
        await new LocalDownloadExecutor().download(url, destination, { sha512: sha512(exact), maxSize: MAX_SIZE })
        expect(await fsExtra.readFile(destination)).toEqual(exact)
      }
    )

    const larger = Buffer.alloc(MAX_SIZE + 1, 3)
    await withServer(
      response => response.end(larger),
      async url => {
        for (const maxSize of [null, -1]) {
          const destination = path.join(dir, `unlimited-${maxSize}.exe`)
          await new LocalDownloadExecutor().download(url, destination, { sha512: sha512(larger), maxSize })
          expect(await fsExtra.readFile(destination)).toEqual(larger)
        }
      }
    )
  })

  // a manifest's `size` is untrusted input: only a number sets a limit, so a value of another type that JavaScript compares as a number
  // ("1", true, []) does not become a limit of a few bytes
  test.for([
    { name: "a numeric string", maxSize: "1" },
    { name: "true", maxSize: true },
    { name: "an empty array", maxSize: [] },
    { name: "NaN", maxSize: Number.NaN },
  ])("a maxSize that is $name sets no limit", async ({ maxSize }, { expect, tmpDir }) => {
    const dir = await tmpDir.getTempDir({ prefix: "download-size-limit" })
    await fsExtra.ensureDir(dir)
    const body = Buffer.alloc(MAX_SIZE, 4)
    await withServer(
      response => response.end(body),
      async url => {
        const destination = path.join(dir, "not-a-number.exe")
        await new LocalDownloadExecutor().download(url, destination, { sha512: sha512(body), maxSize: maxSize as unknown as number })
        expect(await fsExtra.readFile(destination)).toEqual(body)
      }
    )
  })
})

describe("electron-updater full download stops above the declared size", () => {
  const FEED = "https://feed.example.com/updates"
  const INSTALLER_NAME = "TestApp-Setup-1.1.0.exe"
  const INSTALLER = Buffer.from("download size limit test installer — not a real executable")
  const PACKAGE_NAME = "TestApp-1.1.0.nsis.7z"
  const PACKAGE = Buffer.from("download size limit test web package — not a real 7z archive")

  // destroying the response of Electron's net does not end its request: only abort() does
  class RecordingExecutor extends FakeElectronHttpExecutor {
    readonly requests: Array<FakeNetRequest> = []

    protected createNetRequest(options: http.RequestOptions, callback: (response: any) => void): any {
      const request = super.createNetRequest(options, callback)
      this.requests.push(request)
      return request
    }
  }

  // the checksums match the files served, so only the declared size can fail the download; an installerSize of undefined leaves the
  // size out of the manifest
  async function createUpdater(installerSize: unknown, packageSize?: number) {
    const channelFile = serializeToYaml({
      version: "1.1.0",
      files: [{ url: INSTALLER_NAME, sha512: sha512(INSTALLER), ...(installerSize === undefined ? {} : { size: installerSize }) }],
      releaseDate: "2024-01-01T00:00:00.000Z",
      ...(packageSize == null ? {} : { packages: { [process.arch]: { path: PACKAGE_NAME, sha512: sha512(PACKAGE), size: packageSize } } }),
    })
    const files = new Map([
      [`${FEED}/latest.yml`, Buffer.from(channelFile)],
      [`${FEED}/${INSTALLER_NAME}`, INSTALLER],
      [`${FEED}/${PACKAGE_NAME}`, PACKAGE],
    ])
    const updater = await createNsisUpdater("1.0.0")
    updater.autoDownload = false
    updater.updateConfigPath = await writeUpdateConfig({ provider: "generic", url: FEED })
    const executor = new RecordingExecutor(url => {
      // the channel file is requested with a cache-busting query
      const body = files.get(url.replace(/\?.*$/s, ""))
      return body == null ? { statusCode: 404 } : { statusCode: 200, body }
    })
    ;(updater as any).httpExecutor = executor
    return Object.assign(updater, { requests: executor.requests, sent: executor.sent })
  }

  const pendingCacheDir = (updater: Awaited<ReturnType<typeof createUpdater>>): string => (updater as any).downloadedUpdateHelper.cacheDirForPendingUpdate

  test("the installer", async ({ expect }) => {
    const updater = await createUpdater(INSTALLER.length - 1)
    await updater.checkForUpdates()
    await expect(updater.downloadUpdate()).rejects.toMatchObject({ code: "ERR_UPDATER_DOWNLOAD_SIZE_EXCEEDED" })
    expect(updater.requests.filter(request => request.aborted)).toHaveLength(1)
    // the partly written temp file is removed with the rest of the pending update
    expect(await fsExtra.readdir(pendingCacheDir(updater))).toEqual([])

    // positive control: the declared size of the file is accepted
    const exact = await createUpdater(INSTALLER.length)
    await exact.checkForUpdates()
    const { updateFile } = await exact.downloadUpdate()
    expect(await fsExtra.readFile(updateFile)).toEqual(INSTALLER)
  })

  test.for([
    { name: "without a size", size: undefined },
    { name: "with a size that is not a number", size: "1" },
  ])("an installer $name in the manifest downloads without a limit", async ({ size }, { expect }) => {
    const updater = await createUpdater(size)
    await updater.checkForUpdates()
    const { updateFile } = await updater.downloadUpdate()
    expect(await fsExtra.readFile(updateFile)).toEqual(INSTALLER)
  })

  test("the full download a failed differential download falls back to", async ({ expect }) => {
    const updater = await createUpdater(INSTALLER.length - 1)
    // a differential download is attempted (no blockmap is served, so it fails), and outside test mode its failure falls back to a full
    // download; the test-only options are needed only to check for the update as on Windows
    ;(updater as any)._testOnlyOptions = { platform: "win32", isUseDifferentialDownload: true }
    await updater.checkForUpdates()
    ;(updater as any)._testOnlyOptions = null
    await expect(updater.downloadUpdate()).rejects.toMatchObject({ code: "ERR_UPDATER_DOWNLOAD_SIZE_EXCEEDED" })
    expect(updater.sent.map(request => new URL(request.url).pathname)).toEqual(["/updates/latest.yml", `/updates/${INSTALLER_NAME}.blockmap`, `/updates/${INSTALLER_NAME}`])
    expect(updater.requests.filter(request => request.aborted)).toHaveLength(1)
  })

  test("the web package", async ({ expect }) => {
    const updater = await createUpdater(INSTALLER.length, PACKAGE.length - 1)
    updater.disableWebInstaller = false
    await updater.checkForUpdates()
    await expect(updater.downloadUpdate()).rejects.toMatchObject({ code: "ERR_UPDATER_DOWNLOAD_SIZE_EXCEEDED" })

    const exact = await createUpdater(INSTALLER.length, PACKAGE.length)
    exact.disableWebInstaller = false
    await exact.checkForUpdates()
    const { packageFile } = await exact.downloadUpdate()
    expect(packageFile).not.toBeNull()
    expect(await fsExtra.readFile(packageFile ?? "")).toEqual(PACKAGE)
  })
})
