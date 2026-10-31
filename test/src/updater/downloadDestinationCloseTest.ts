import { CancellationToken, configureRequestOptions, configureRequestUrl, HttpExecutor } from "builder-util-runtime"
import fsExtra from "fs-extra"
import * as http from "http"
import type { IncomingMessage } from "http"
import type { Socket } from "net"
import * as path from "path"
import { describe, test } from "vitest"

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

  downloadWithTimeout(url: URL, destination: string, timeout: number, cancellationToken = new CancellationToken()): Promise<string> {
    return cancellationToken.createPromise<string>((resolve, reject, onCancel) => {
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
