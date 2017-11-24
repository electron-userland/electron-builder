import { path7za } from "7zip-bin"
import { ensureDir, outputFile, outputJson } from "fs-extra-p"
import { constants, connect, ClientHttp2Stream, OutgoingHttpHeaders, ClientHttp2Session, SecureClientSessionOptions } from "http2"
import BluebirdPromise from "bluebird-lst"
import { spawn } from "child_process"
import { debug, Arch, isEnvTrue } from "builder-util"
import * as path from "path"
import { createWriteStream } from "fs"
import { httpExecutor } from "builder-util/out/nodeHttpExecutor"
import { UploadTask } from "electron-publish"
import { HttpError } from "builder-util-runtime"
import { Target, TargetSpecificOptions } from "../core"
import { ArtifactCreated } from "../packagerApi"
import { PlatformPackager } from "../platformPackager"
import { JsonStreamParser } from "../util/JsonStreamParser"
import { time } from "../util/timer"
import { ELECTRON_BUILD_SERVICE_CA_CERT, ELECTRON_BUILD_SERVICE_LOCAL_CA_CERT } from "./remote-builder-certs"

const {
  HTTP2_HEADER_PATH,
  HTTP2_METHOD_POST,
  HTTP2_METHOD_GET,
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
  // noinspection JSMethodCanBeStatic
  async build(targets: Array<string>, unpackedDirectory: string, packager: PlatformPackager<any>, outDir: string): Promise<any> {
    const endpoint = await findBuildAgent()
    const buildManager = new RemoteBuildManager(endpoint, unpackedDirectory, outDir, packager)
    const result = await buildManager.build({
      "x-targets": targets,
      "x-platform": packager.platform.buildConfigurationKey,
    })
    if (result != null && result.error != null) {
      throw new Error(`Remote builder error (if you think that it is not your application misconfiguration issue, please file issue to https://github.com/electron-userland/electron-builder/issues):\n\n${result.error}`)
    }
  }
}

async function findBuildAgent(): Promise<string> {
  const result = process.env.ELECTRON_BUILD_SERVICE_ENDPOINT
  if (result != null) {
    debug(`Remote build endpoint set explicitly: ${result}`)
    return result.startsWith("http") ? result : `https://${result}`
  }

  const agentInfo = JSON.parse((await httpExecutor.request({
    hostname: "www.electron.build",
    // add random query param to prevent caching
    path: `/find-build-agent?c=${Date.now().toString(32)}`,
  }))!!)
  return agentInfo.endpoint
}

function getZstdCompressionLevel(endpoint: string): string {
  const result = process.env.ELECTRON_BUILD_SERVICE_ZSTD_COMPRESSION
  if (result != null) {
    return result
  }
  return endpoint.startsWith("https://127.0.0.1:") || endpoint.startsWith("https://localhost:") || endpoint.startsWith("[::1]:") ? "3" : "19"
}

class RemoteBuildManager {
  private readonly client: ClientHttp2Session

  private files: Array<ArtifactInfo> | null = null
  private finishedStreamCount = 0

  constructor(private readonly buildServiceEndpoint: string, private readonly unpackedDirectory: string, private readonly outDir: string, private readonly packager: PlatformPackager<any>) {
    debug(`Connect to remote build service: ${buildServiceEndpoint}`)
    const options: SecureClientSessionOptions = {}
    const caCert = process.env.ELECTRON_BUILD_SERVICE_CA_CERT
    if (caCert !== "false") {
      const isUseLocalCert = isEnvTrue(process.env.USE_ELECTRON_BUILD_SERVICE_LOCAL_CA)
      if (isUseLocalCert) {
        debug("Local certificate authority is used")
      }
      options.ca = caCert || (isUseLocalCert ? ELECTRON_BUILD_SERVICE_LOCAL_CA_CERT : ELECTRON_BUILD_SERVICE_CA_CERT)
      // we cannot issue cert per IP because build agent can be started on demand (and for security reasons certificate authority is offline).
      // Since own certificate authority is used, it is ok to skip server name verification.
      options.checkServerIdentity = () => undefined
    }
    this.client = connect(buildServiceEndpoint, options)
  }

  build(customHeaders: OutgoingHttpHeaders): Promise<RemoteBuilderResponse | null> {
    return new BluebirdPromise<RemoteBuilderResponse | null>((resolve, reject) => {
      const client = this.client
      client.on("socketError", reject)
      client.on("error", reject)

      let handled = false
      client.once("close", () => {
        if (!handled) {
          reject(new Error("Closed unexpectedly"))
        }
      })
      client.once("timeout", () => {
        reject(new Error("Timeout"))
      })

      this.doBuild(customHeaders, result => {
        handled = true
        resolve(result)
      }, reject)
    })
      .catch(error => {
        if (error.code === "ECONNREFUSED") {
          throw new Error(`Cannot connect to electron build service ${this.buildServiceEndpoint}: ${error.message}`)
        }
        else {
          throw error
        }
      })
      .finally(() => {
        this.client.destroy()
      })
  }

  private async saveConfigurationAndMetadata() {
    const packager = this.packager.info
    const tempDir = await packager.tempDirManager.createTempDir({prefix: "remote-build-metadata"})
    // we cannot use getTempFile because file name must be constant
    const info: any = {
      metadata: packager.metadata,
      configuration: packager.config,
      repositoryInfo: packager.repositoryInfo,
    }
    if (packager.metadata !== packager.devMetadata && packager.devMetadata != null) {
      info.devMetadata = packager.devMetadata
    }
    const file = path.join(tempDir, "info.json")
    await outputJson(file, info)
    return file
  }

  private doBuild(customHeaders: OutgoingHttpHeaders, resolve: (result: RemoteBuilderResponse | null) => void, reject: (error: Error) => void): void {
    this.upload(customHeaders, resolve, reject)
  }

  private upload(customHeaders: OutgoingHttpHeaders, resolve: (result: RemoteBuilderResponse | null) => void, reject: (error: Error) => void) {
    const zstdCompressionLevel = getZstdCompressionLevel(this.buildServiceEndpoint)

    const stream = this.client.request({
      [HTTP2_HEADER_PATH]: "/v1/upload",
      [HTTP2_HEADER_METHOD]: HTTP2_METHOD_POST,
      [HTTP2_HEADER_CONTENT_TYPE]: "application/octet-stream",
      ...customHeaders,
      // only for stats purpose, not required for build
      "x-zstd-compression-level": zstdCompressionLevel,
    })
    stream.on("error", reject)
    // this.handleStreamEvent(resolve, reject)
    this.uploadUnpackedAppArchive(stream, zstdCompressionLevel, reject)

    stream.on("response", headers => {
      const status: number = headers[HTTP2_HEADER_STATUS] as any
      if (status !== HTTP_STATUS_OK && status !== HTTP_STATUS_BAD_REQUEST) {
        reject(new HttpError(status))
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
          reject(new HttpError(status, JSON.stringify(result, null, 2)))
          return
        }

        const id = result.id
        if (id == null) {
          reject(new Error("Server didn't return id"))
          return
        }

        // cannot connect immediately because channel status is not yet created
        setTimeout(() => this.listenEvents(id, resolve, reject), 3 * 1000 /* min build time */)
      })
    })
  }

  private listenEvents(id: string, resolve: (result: RemoteBuilderResponse | null) => void, reject: (error: Error) => void) {
    const stream = this.client.request({
      [HTTP2_HEADER_PATH]: `/v1/status/${id}`,
      [HTTP2_HEADER_METHOD]: HTTP2_METHOD_GET,
    })
    stream.on("error", reject)
    stream.on("response", headers => {
      if (!checkStatus(headers[HTTP2_HEADER_STATUS] as any, reject)) {
        return
      }

      stream.setEncoding("utf8")
      const eventSource = new JsonStreamParser(data => {
        if (debug.enabled) {
          debug(`Remote builder event: ${JSON.stringify(data)}`)
        }

        const error = data.error
        if (error != null) {
          return
        }

        if (!("files" in data)) {
          console.error(`Unknown builder event: ${JSON.stringify(data)}`)
          return
        }

        this.files = data.files
        for (const artifact of this.files!!) {
          this.downloadFile(id, artifact, resolve, reject)
        }
      })
      stream.on("data", (chunk: string) => eventSource.parseIncoming(chunk))
      stream.on("end", () => {
        console.log("event stream end")
      })
    })
  }

  private downloadFile(id: string, artifact: ArtifactInfo, resolve: (result: RemoteBuilderResponse | null) => void, reject: (error: Error) => void) {
    const stream = this.client.request({
      [HTTP2_HEADER_PATH]: `/v1/download/${id}/${artifact.file}`,
      [HTTP2_HEADER_METHOD]: HTTP2_METHOD_GET,
    })
    stream.on("error", reject)

    const localFile = path.join(this.outDir, artifact.file)
    const artifactCreatedEvent = this.artifactInfoToArtifactCreatedEvent(artifact, localFile)
    const fileWritten = () => {
      this.finishedStreamCount++
      if (debug.enabled) {
        debug(`Remote artifact saved to: ${localFile}`)
      }

      // PublishManager uses outDir and options, real (the same as for local build) values must be used
      this.packager.info.dispatchArtifactCreated(artifactCreatedEvent)

      if (this.files != null && this.finishedStreamCount >= this.files.length) {
        resolve(null)
      }
    }

    stream.on("response", headers => {
      if (!checkStatus(headers[HTTP2_HEADER_STATUS] as any, reject)) {
        return
      }

      if (artifact.file.endsWith(".yml") || artifact.file.endsWith(".json")) {
        const buffers: Array<Buffer> = []
        stream.on("end", () => {
          const fileContent = buffers.length === 1 ? buffers[0] : Buffer.concat(buffers)
          artifactCreatedEvent.fileContent = fileContent
          outputFile(localFile, fileContent)
            .then(fileWritten)
            .catch(reject)
        })
        stream.on("data", (chunk: Buffer) => {
          buffers.push(chunk)
        })
      }
      else {
        ensureDir(path.dirname(localFile))
          .then(() => {
            const fileStream = createWriteStream(localFile, {
              // 1MB buffer, download as faster as possible, reduce chance that download will be paused for a while due to slow file write
              highWaterMark: 1024 * 1024,
            } as any)
            fileStream.on("error", reject)
            fileStream.on("close", fileWritten)
            stream.pipe(fileStream)
          })
          .catch(reject)
      }
    })
  }

  private artifactInfoToArtifactCreatedEvent(artifact: ArtifactInfo, localFile: string): ArtifactCreated {
    const target = artifact.target
    // noinspection SpellCheckingInspection
    return {
      ...artifact,
      file: localFile,
      target: target == null ? null : new FakeTarget(target, this.outDir, (this.packager.config as any)[target]),
      packager: this.packager,
    }
  }

  // compress and upload in the same time, directly to remote without intermediate local file
  private uploadUnpackedAppArchive(stream: ClientHttp2Stream, zstdCompressionLevel: string, reject: (error: Error) => void) {
    this.saveConfigurationAndMetadata()
      .then(infoFile => {
        const compressAndUploadTimer = time("compress and upload")
        // noinspection SpellCheckingInspection
        const tarProcess = spawn(path7za, ["a", "dummy", "-ttar", "-so", this.unpackedDirectory, infoFile], {
          stdio: ["pipe", "pipe", process.stderr],
        })
        tarProcess.stdout.on("error", reject)

        const zstdProcess = spawn("zstd", [`-${zstdCompressionLevel}`, "--long"], {
          stdio: ["pipe", "pipe", process.stderr],
        })
        zstdProcess.on("error", reject)
        tarProcess.stdout.pipe(zstdProcess.stdin)
        zstdProcess.stdout.pipe(stream)

        zstdProcess.stdout.on("end", () => {
          compressAndUploadTimer.end()
        })
      })
      .catch(reject)
  }
}

function checkStatus(status: number, reject: (error: Error) => void) {
  if (status === HTTP_STATUS_OK) {
    return true
  }
  else {
    reject(new HttpError(status))
    return false
  }
}

class FakeTarget extends Target {
  constructor(name: string, readonly outDir: string, readonly options: TargetSpecificOptions | null | undefined) {
    super(name)
  }

  async build(appOutDir: string, arch: Arch) {
    // no build
  }
}

export interface ArtifactInfo extends UploadTask {
  target: string | null

  readonly isWriteUpdateInfo?: boolean
  readonly updateInfo?: any
}