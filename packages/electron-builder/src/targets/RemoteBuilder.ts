import { path7za } from "7zip-bin"
import { constants, connect, ClientHttp2Stream, OutgoingHttpHeaders } from "http2"
import BluebirdPromise from "bluebird-lst"
import { spawn } from "child_process"
import { Packager } from "../packager"
import { debug } from "builder-util"
import * as path from "path"
import { createWriteStream } from "fs"

const {
  HTTP2_HEADER_PATH,
  HTTP2_METHOD_POST,
  HTTP2_HEADER_METHOD,
  HTTP2_HEADER_CONTENT_TYPE,
  HTTP2_HEADER_STATUS,
  HTTP_STATUS_OK,
  HTTP_STATUS_BAD_REQUEST
} = constants

interface RemoteBuilderResponse {
  error?: string
}

export class RemoteBuilder {
  async build(platform: string, targets: Array<string>, unpackedDirectory: string, packager: Packager, outDir: string): Promise<any> {
    const result = await this.sendRequest({
      "x-targets": targets,
      "x-platform": platform,
    }, unpackedDirectory, packager, outDir)
    if (result != null && result.error != null) {
      throw new Error(`Remote builder error (if you think that it is not your application misconfiguration issue, please file issue to https://github.com/electron-userland/electron-builder/issues):\n\n${result.error}`)
    }
  }

  private sendRequest(customHeaders: OutgoingHttpHeaders, unpackedDirectory: string, packager: Packager, outDir: string): Promise<RemoteBuilderResponse | null> {
    const buildServiceEndpoint = process.env.ELECTRON_BUILD_SERVICE_ENDPOINT
    if (buildServiceEndpoint == null) {
      throw new Error("Please set env ELECTRON_BUILD_SERVICE_ENDPOINT to URL of Electron Build Service URL")
    }

    const client = connect(buildServiceEndpoint)
    return new BluebirdPromise<RemoteBuilderResponse>((resolve, reject) => {
      client.on("socketError", reject)
      client.on("error", reject)

      let handled = false

      let files: Array<string> | null  = null
      let finishedStreamCount = 0
      client.on("stream", (stream, headers) => {
        const file = headers[HTTP2_HEADER_PATH] as string

        if (debug.enabled) {
          debug(`Remote builder stream: ${file}`)
        }

        const localFile = path.join(outDir, file)
        const fileStream = createWriteStream(localFile)
        fileStream.on("error", reject)
        stream.on("error", reject)
        stream.on("end", () => {
          finishedStreamCount++
          if (debug.enabled) {
            debug(`Remote artifact saved to: ${localFile}`)
          }
          if (files != null && finishedStreamCount >= files.length) {
            resolve()
          }
        })
        stream.pipe(fileStream)
      })

      client.on("close", () => {
        if (!handled) {
          reject(new Error("Closed unexpectedly"))
        }
      })
      client.on("timeout", () => {
        if (!handled) {
          reject(new Error("Timeout"))
        }
      })

      const stream = client.request({
        [HTTP2_HEADER_PATH]: "/v1/build",
        [HTTP2_HEADER_METHOD]: HTTP2_METHOD_POST,
        [HTTP2_HEADER_CONTENT_TYPE]: "application/octet-stream",
        ...customHeaders,
      })
      stream.on("error", reject)

      uploadUnpackedAppArchive(stream, unpackedDirectory, path.join(packager.appDir, "package.json"), resolve, reject)

      stream.on("response", headers => {
        handled = true

        const status: number = headers[HTTP2_HEADER_STATUS] as any
        if (status !== HTTP_STATUS_OK && status !== HTTP_STATUS_BAD_REQUEST) {
          reject(`Error: ${status}`)
          return
        }

        let data = ""
        stream.setEncoding("utf8")
        stream.on("data", (chunk: string) => {
          data += chunk
        })
        stream.on("end", () => {
          const result = data.length === 0 ? {} : JSON.parse(data)
          if (debug.enabled) {
            debug(`Remote builder result: ${JSON.stringify(result, null, 2)}`)
          }

          if (status === HTTP_STATUS_BAD_REQUEST) {
            reject(new Error(JSON.stringify(result, null, 2)))
            return
          }

          files = result.files
          if (files == null) {
            if (result.error == null) {
              reject("Incorrect result, list of files is expected")
            }
            else {
              resolve(result)
            }
            return
          }

          // pushed streams can be already handled
          if (finishedStreamCount >= files!!.length) {
            resolve()
          }
        })
      })
    })
      .catch(error => {
        client.destroy()
        throw error
      })
  }
}

// compress and upload in the same time, directly to remote without intermediate local file
function uploadUnpackedAppArchive(stream: ClientHttp2Stream, unpackedDirectory: string, appPackageJson: string, resolve: () => void, reject: (error: Error) => void) {
  if (debug.enabled) {
    debug(`Use ${appPackageJson} as project package.json for remote build`)
  }

  // noinspection SpellCheckingInspection
  const tarProcess = spawn(path7za, ["a", "dummy", "-ttar", "-so", unpackedDirectory, appPackageJson], {
    stdio: ["pipe", "pipe", process.stderr],
  })
  tarProcess.stdout.on("error", reject)

  const zstdProcess = spawn("zstd", ["-" + (process.env.RB_ZSTD_COMPRESSION || "22"), "--long"], {
    stdio: ["pipe", "pipe", process.stderr],
  })
  zstdProcess.on("error", reject)
  tarProcess.stdout.pipe(zstdProcess.stdin)
  zstdProcess.stdout.pipe(stream)
}