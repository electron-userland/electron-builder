import { CancellationToken, configureRequestOptions, configureRequestUrl, HttpExecutor } from "builder-util-runtime"
import type { EventEmitter } from "events"
import fs from "fs"
import fsExtra from "fs-extra"
import * as http from "http"
import type { IncomingMessage } from "http"
import type { Socket } from "net"
import * as path from "path"
import { describe, test, vi } from "vitest"
import { FakeNetRequest } from "../helpers/updaterTestUtil.js"

const BODY_LENGTH = 64 * 1024
const SENT_BEFORE_STALL = 1024

// Full downloads (ElectronHttpExecutor.download) pipe the response into the destination file through configurePipes. A response
// that fails or is aborted mid-body must not leave the destination open: that fd would stay open for the life of the app.
class StallingDownloadExecutor extends HttpExecutor<http.ClientRequest> {
  constructor(private readonly onResponse: ((response: IncomingMessage) => void) | null) {
    super()
  }

  // plain http.request: the server is local, so no proxy from the environment
  createRequest(options: http.RequestOptions, callback: (response: IncomingMessage) => void): http.ClientRequest {
    return http.request(options, response => {
      callback(response)
      this.onResponse?.(response)
    })
  }

  downloadWithTimeout(url: URL, destination: string | null, timeout: number, cancellationToken = new CancellationToken()): Promise<string | null> {
    return cancellationToken.createPromise<string | null>((resolve, reject, onCancel) => {
      const requestOptions: http.RequestOptions = { timeout }
      configureRequestUrl(url, requestOptions)
      configureRequestOptions(requestOptions)
      this.doDownload(
        requestOptions,
        {
          destination,
          options: { cancellationToken },
          onCancel,
          callback: error => (error == null ? resolve(destination) : reject(error)),
          responseHandler: null,
        },
        0
      )
    })
  }
}

// whether this process holds an open file descriptor on `file` (Linux: /proc/self/fd)
async function isFileOpen(file: string): Promise<boolean> {
  const fdDir = "/proc/self/fd"
  for (const fd of await fsExtra.readdir(fdDir)) {
    const target = await fsExtra.readlink(path.join(fdDir, fd)).catch(() => null)
    if (target === file) {
      return true
    }
  }
  return false
}

// Holds back the close of `destination` by `delayMs`, as a busy disk or thread pool does, and reports `closeError` (when given) from that
// close. WriteStream opens and closes its file through the fs module. `isClosed` tells whether the close has completed.
function interceptDestinationClose(destination: string, delayMs: number, closeError: NodeJS.ErrnoException | null = null) {
  const realOpen = fs.open
  const realClose = fs.close
  const destinationFds = new Set<number>()
  const state = { isClosed: false }
  const openSpy = vi.spyOn(fs, "open").mockImplementation(((...args: Array<any>) => {
    const callback = args[args.length - 1]
    if (args[0] === destination && typeof callback === "function") {
      args[args.length - 1] = (error: Error | null, fd: number) => {
        if (error == null) {
          destinationFds.add(fd)
        }
        callback(error, fd)
      }
    }
    ;(realOpen as any)(...args)
  }) as any)
  const closeSpy = vi.spyOn(fs, "close").mockImplementation(((fd: number, callback: (error: Error | null) => void) => {
    if (!destinationFds.delete(fd)) {
      ;(realClose as any)(fd, callback)
      return
    }
    setTimeout(() => {
      realClose(fd, error => {
        state.isClosed = true
        callback(closeError ?? error)
      })
    }, delayMs)
  }) as any)
  return {
    isClosed: () => state.isClosed,
    restore: () => {
      openSpy.mockRestore()
      closeSpy.mockRestore()
    },
  }
}

async function waitFor(condition: () => Promise<boolean>, what: string): Promise<void> {
  const deadline = Date.now() + 10_000
  while (!(await condition())) {
    if (Date.now() > deadline) {
      throw new Error(`timed out waiting for ${what}`)
    }
    await new Promise(resolve => setTimeout(resolve, 20))
  }
}

// sends the start of the body, then stalls forever
function sendStartOfBody(response: http.ServerResponse): void {
  response.writeHead(200, { "Content-Length": BODY_LENGTH, "Content-Type": "application/octet-stream" })
  response.write(Buffer.alloc(SENT_BEFORE_STALL, 1))
}

async function withStallingServer(task: (url: URL) => Promise<void>, onRequest: (response: http.ServerResponse) => void = sendStartOfBody): Promise<void> {
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

async function waitForPartialFile(destination: string): Promise<void> {
  await waitFor(async () => ((await fsExtra.stat(destination).catch(() => null))?.size ?? 0) >= SENT_BEFORE_STALL, "the start of the body on disk")
}

describe.runIf(process.platform === "linux")("download destination is closed when the response ends early", () => {
  test("a request that times out mid-body (the response errors)", async ({ expect, tmpDir }) => {
    const dir = await tmpDir.getTempDir({ prefix: "download-close" })
    await fsExtra.ensureDir(dir)
    const destination = path.join(dir, "timeout.exe")
    await withStallingServer(async url => {
      const executor = new StallingDownloadExecutor(null)
      const download = executor.downloadWithTimeout(url, destination, 500)
      // check the probe itself: the destination is open while the body streams
      await waitForPartialFile(destination)
      expect(await isFileOpen(destination)).toBe(true)

      await expect(download).rejects.toThrow("Request timed out")
      await waitFor(async () => !(await isFileOpen(destination)), "the destination to be closed")
    })
  })

  test("a response destroyed mid-body without an error (like Electron's request.abort())", async ({ expect, tmpDir }) => {
    const dir = await tmpDir.getTempDir({ prefix: "download-close" })
    await fsExtra.ensureDir(dir)
    const destination = path.join(dir, "abort.exe")
    await withStallingServer(async url => {
      const received: { response: IncomingMessage | null } = { response: null }
      const executor = new StallingDownloadExecutor(it => {
        received.response = it
      })
      // no timeout: only the destroyed response can end this download
      void executor.downloadWithTimeout(url, destination, 0).catch(() => {
        // the outcome is not what this test checks
      })
      await waitForPartialFile(destination)
      expect(await isFileOpen(destination)).toBe(true)
      expect(received.response).not.toBeNull()

      received.response?.destroy()
      await waitFor(async () => !(await isFileOpen(destination)), "the destination to be closed")
    })
  })
})

describe("a download that fails mid-body", () => {
  // configurePipes reports a failure of the response itself, after the destination is closed: without it, a connection cut mid-body
  // would leave the download pending (with no timeout) instead of rejecting it
  test("rejects with the response's error, and the destination is closed by then", async ({ expect, tmpDir }) => {
    const dir = await tmpDir.getTempDir({ prefix: "download-close" })
    await fsExtra.ensureDir(dir)
    const destination = path.join(dir, "reset.exe")
    const cutAfterStartOfBody = (response: http.ServerResponse) => {
      sendStartOfBody(response)
      setTimeout(() => response.socket?.destroy(), 100)
    }
    const close = interceptDestinationClose(destination, 200)
    try {
      await withStallingServer(async url => {
        // no timeout: only the failed response can end this download
        const outcome = await Promise.race([
          new StallingDownloadExecutor(null).downloadWithTimeout(url, destination, 0).then(
            () => "resolved",
            (error: any) => `rejected: ${error?.code}, closed: ${close.isClosed()}`
          ),
          new Promise<string>(resolve => setTimeout(() => resolve("still pending 5 s after the connection was cut"), 5000)),
        ])
        // closed before the rejection, so it can be removed at once (Windows cannot remove a file that is still open)
        expect(outcome).toBe("rejected: ECONNRESET, closed: true")
      }, cutAfterStartOfBody)
    } finally {
      close.restore()
    }
  })

  // a failure of the request (here its timeout; with Electron's net, a lost connection too) goes the same way as one of the response
  test("a request that times out mid-body rejects once the destination is closed", async ({ expect, tmpDir }) => {
    const dir = await tmpDir.getTempDir({ prefix: "download-close" })
    await fsExtra.ensureDir(dir)
    const destination = path.join(dir, "timeout.exe")
    const close = interceptDestinationClose(destination, 200)
    try {
      await withStallingServer(async url => {
        const outcome = await new StallingDownloadExecutor(null).downloadWithTimeout(url, destination, 300).then(
          () => "resolved",
          (error: any) => `rejected: ${error?.message}, closed: ${close.isClosed()}`
        )
        expect(outcome).toBe("rejected: Request timed out, closed: true")
      })
    } finally {
      close.restore()
    }
  })

  test("a destination whose close fails after the whole body is written rejects with that failure", async ({ expect, tmpDir }) => {
    const dir = await tmpDir.getTempDir({ prefix: "download-close" })
    await fsExtra.ensureDir(dir)
    const destination = path.join(dir, "close-fails.exe")
    const close = interceptDestinationClose(destination, 0, Object.assign(new Error("EIO: i/o error, close"), { code: "EIO" }))
    try {
      await withStallingServer(
        async url => {
          await expect(new StallingDownloadExecutor(null).downloadWithTimeout(url, destination, 0)).rejects.toMatchObject({ code: "EIO" })
        },
        response => response.end(Buffer.alloc(SENT_BEFORE_STALL, 1))
      )
    } finally {
      close.restore()
    }
  })

  // the response is not read on such a failure: an error it emits later (as Electron's net does when the connection is lost) must be
  // handled, not thrown as an uncaught exception. A plain HttpExecutor over the net fake, which keeps the header's case as given and,
  // unlike ElectronHttpExecutor, adds no idle timeout (whose listener would handle it)
  test("a response rejected for its X-Checksum-Sha2 header still handles its errors", async ({ expect, tmpDir }) => {
    const dir = await tmpDir.getTempDir({ prefix: "download-close" })
    await fsExtra.ensureDir(dir)
    const responses: Array<EventEmitter> = []
    class FakeNetDownloadExecutor extends HttpExecutor<any> {
      createRequest(options: http.RequestOptions, callback: (response: any) => void): any {
        const request = new FakeNetRequest({
          url: `${options.protocol}//${options.hostname}${options.path}`,
          answer: () => ({ statusCode: 200, headers: { "X-Checksum-Sha2": "served" }, body: Buffer.alloc(16, 1) }),
        })
        request.on("response", response => {
          responses.push(response)
          callback(response)
        })
        return request
      }

      download(destination: string, sha2: string): Promise<void> {
        const cancellationToken = new CancellationToken()
        return cancellationToken.createPromise<void>((resolve, reject, onCancel) => {
          const requestOptions: http.RequestOptions = {}
          configureRequestUrl(new URL("https://example.com/update.exe"), requestOptions)
          this.doDownload(
            requestOptions,
            {
              destination,
              options: { cancellationToken, sha2 },
              onCancel,
              callback: error => (error == null ? resolve() : reject(error)),
              responseHandler: null,
            },
            0
          )
        })
      }
    }
    await expect(new FakeNetDownloadExecutor().download(path.join(dir, "sha2-mismatch.exe"), "expected")).rejects.toThrow("X-Checksum-Sha2 header")
    expect(responses).toHaveLength(1)
    expect(() => responses[0].emit("error", new Error("net::ERR_CONNECTION_RESET"))).not.toThrow()
  })

  test("a download into a file without a destination rejects", async ({ expect }) => {
    await withStallingServer(async url => {
      const outcome = await Promise.race([
        new StallingDownloadExecutor(null).downloadWithTimeout(url, null, 0).then(
          () => "resolved",
          (error: any) => `rejected: ${error?.message}`
        ),
        new Promise<string>(resolve => setTimeout(() => resolve("still pending after 5 s"), 5000)),
      ])
      expect(outcome).toBe("rejected: Cannot download into a file: no destination")
    })
  })
})

// The server side of a request. The server never ends a response, so only the client closing the connection closes it.
class ServedRequest {
  isClosed = false

  constructor(readonly response: http.ServerResponse) {
    response.on("close", () => {
      this.isClosed = true
    })
  }
}

describe("cancelling a download aborts its request", () => {
  test("a cancel mid-body closes the connection", async ({ expect, tmpDir }) => {
    const dir = await tmpDir.getTempDir({ prefix: "download-cancel" })
    await fsExtra.ensureDir(dir)
    const destination = path.join(dir, "mid-body.exe")
    const served: Array<ServedRequest> = []
    await withStallingServer(
      async url => {
        const cancellationToken = new CancellationToken()
        const download = new StallingDownloadExecutor(null).downloadWithTimeout(url, destination, 0, cancellationToken)
        await waitForPartialFile(destination)

        cancellationToken.cancel()
        await expect(download).rejects.toThrow("cancelled")
        await waitFor(async () => served[0].isClosed, "the client to close the connection")
      },
      response => {
        served.push(new ServedRequest(response))
        sendStartOfBody(response)
      }
    )
  })

  test("a cancel after a redirect closes the connection of the redirect's request", async ({ expect, tmpDir }) => {
    const dir = await tmpDir.getTempDir({ prefix: "download-cancel" })
    await fsExtra.ensureDir(dir)
    const destination = path.join(dir, "redirected.exe")
    const served: Array<ServedRequest> = []
    await withStallingServer(
      async url => {
        const cancellationToken = new CancellationToken()
        const download = new StallingDownloadExecutor(null).downloadWithTimeout(url, destination, 0, cancellationToken)
        await waitForPartialFile(destination)

        cancellationToken.cancel()
        await expect(download).rejects.toThrow("cancelled")
        await waitFor(async () => served[0].isClosed, "the client to close the connection")
      },
      response => {
        if (response.req.url === "/update.exe") {
          response.writeHead(302, { Location: "/redirected.exe" })
          response.end()
          return
        }
        served.push(new ServedRequest(response))
        sendStartOfBody(response)
      }
    )
  })

  test("a response sent after a cancel does not create the destination", async ({ expect, tmpDir }) => {
    const dir = await tmpDir.getTempDir({ prefix: "download-cancel" })
    await fsExtra.ensureDir(dir)
    const destination = path.join(dir, "before-response.exe")
    const served: Array<ServedRequest> = []
    // holds the response until the download is cancelled
    await withStallingServer(
      async url => {
        const cancellationToken = new CancellationToken()
        const download = new StallingDownloadExecutor(null).downloadWithTimeout(url, destination, 0, cancellationToken)
        await waitFor(async () => served.length === 1, "the request to reach the server")

        cancellationToken.cancel()
        await expect(download).rejects.toThrow("cancelled")
        sendStartOfBody(served[0].response)
        // once the connection is closed, no response can reach the download
        await waitFor(async () => served[0].isClosed, "the client to close the connection")
        expect(fsExtra.existsSync(destination)).toBe(false)
      },
      response => served.push(new ServedRequest(response))
    )
  })

  test("a cancelled buffer download (a blockmap) closes the connection", async ({ expect }) => {
    const served: Array<ServedRequest> = []
    await withStallingServer(
      async url => {
        const cancellationToken = new CancellationToken()
        const download = new StallingDownloadExecutor(null).downloadToBuffer(url, { cancellationToken })
        await waitFor(async () => served.length === 1, "the request to reach the server")

        cancellationToken.cancel()
        await expect(download).rejects.toThrow("cancelled")
        await waitFor(async () => served[0].isClosed, "the client to close the connection")
      },
      response => {
        served.push(new ServedRequest(response))
        sendStartOfBody(response)
      }
    )
  })
})
