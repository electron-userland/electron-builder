import { path7za } from "7zip-bin"
import BluebirdPromise from "bluebird-lst"
import { Arch, isEnvTrue, log, executeAppBuilder } from "builder-util"
import { HttpError } from "builder-util-runtime"
import { spawn } from "child_process"
import { UploadTask } from "electron-publish"
import { ClientHttp2Session, ClientHttp2Stream, connect, constants, OutgoingHttpHeaders, SecureClientSessionOptions } from "http2"
import * as path from "path"
import { Target, TargetSpecificOptions } from "../core"
import { ArtifactCreated } from "../packagerApi"
import { PlatformPackager } from "../platformPackager"
import { getZstd } from "../targets/tools"
import { DevTimer } from "../util/timer"
import { ProjectInfoManager } from "./ProjectInfoManager"
import { ELECTRON_BUILD_SERVICE_CA_CERT, ELECTRON_BUILD_SERVICE_LOCAL_CA_CERT } from "./remote-builder-certs"
import { RemoteBuilderResponse } from "./RemoteBuilder"

const {
  HTTP2_HEADER_PATH,
  HTTP2_METHOD_POST,
  HTTP2_HEADER_METHOD,
  HTTP2_HEADER_CONTENT_TYPE,
  HTTP2_HEADER_STATUS,
  HTTP_STATUS_OK,
} = constants

const isUseLocalCert = isEnvTrue(process.env.USE_ELECTRON_BUILD_SERVICE_LOCAL_CA)

export function getConnectOptions(): SecureClientSessionOptions {
  const options: SecureClientSessionOptions = {}
  const caCert = process.env.ELECTRON_BUILD_SERVICE_CA_CERT
  if (caCert !== "false") {
    if (isUseLocalCert) {
      log.debug(null, "local certificate authority is used")
    }
    options.ca = caCert || (isUseLocalCert ? ELECTRON_BUILD_SERVICE_LOCAL_CA_CERT : ELECTRON_BUILD_SERVICE_CA_CERT)
    // we cannot issue cert per IP because build agent can be started on demand (and for security reasons certificate authority is offline).
    // Since own certificate authority is used, it is ok to skip server name verification.
    options.checkServerIdentity = () => undefined
  }
  return options
}

export class RemoteBuildManager {
  private readonly client: ClientHttp2Session

  constructor(private readonly buildServiceEndpoint: string,
              private readonly projectInfoManager: ProjectInfoManager,
              private readonly unpackedDirectory: string,
              private readonly outDir: string,
              private readonly packager: PlatformPackager<any>) {
    log.debug({endpoint: buildServiceEndpoint}, "connect to remote build service")
    this.client = connect(buildServiceEndpoint, getConnectOptions())
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

      this.doBuild(customHeaders)
        .then(result => {
          handled = true

          if (result.files != null) {
            for (const artifact of result.files) {
              const localFile = path.join(this.outDir, artifact.file)
              const artifactCreatedEvent = this.artifactInfoToArtifactCreatedEvent(artifact, localFile)
              // PublishManager uses outDir and options, real (the same as for local build) values must be used
              this.projectInfoManager.packager.dispatchArtifactCreated(artifactCreatedEvent)
            }
          }

          resolve(result)
        })
        .catch(reject)
    })
      .finally(() => {
        this.client.destroy()
      })
  }

  private doBuild(customHeaders: OutgoingHttpHeaders): Promise<RemoteBuilderResponse> {
    const StreamJsonObjects = require("stream-json/utils/StreamJsonObjects")
    return new BluebirdPromise((resolve, reject) => {
      const zstdCompressionLevel = getZstdCompressionLevel(this.buildServiceEndpoint)
      const stream = this.client.request({
        [HTTP2_HEADER_PATH]: "/v2/build",
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
        if (status !== HTTP_STATUS_OK) {
          reject(new HttpError(status))
          return
        }

        const objectStream = StreamJsonObjects.make()
        objectStream.output.on("data", (object: any) => {
          const data = object.value
          if (log.isDebugEnabled) {
            log.debug({event: JSON.stringify(data, null, 2)}, "remote builder event")
          }

          if (data.status != null) {
            log.info({status: data.status}, "remote building")
          }
          else if ("error" in data) {
            resolve({files: null, error: data.error})
          }
          else if ("files" in data) {
            this.downloadArtifacts(data.files, data.fileSizes, data.baseUrl)
              .then(() => {
                stream.destroy()
                resolve({files: data.files, error: null})
              })
              .catch(reject)
          }
          else {
            log.warn(`Unknown builder event: ${JSON.stringify(data)}`)
          }
        })
        stream.pipe(objectStream.input)
      })
    })
  }

  private downloadArtifacts(files: Array<ArtifactInfo>, fileSizes: Array<number>, baseUrl: string) {
    const args = ["download-resolved-files", "--out", this.outDir, "--base-url", this.buildServiceEndpoint + baseUrl]
    for (let i = 0; i < files.length; i++) {
      const artifact = files[i]
      args.push("-f", artifact.file)
      args.push("-s", fileSizes[i].toString())
    }
    return executeAppBuilder(args)
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
    const packager = this.projectInfoManager.packager
    const buildResourcesDir = packager.buildResourcesDir
    if (buildResourcesDir === packager.projectDir) {
      reject(new Error(`Build resources dir equals to project dir and so, not sent to remote build agent. It will lead to incorrect results.\nPlease set "directories.buildResources" to separate dir or leave default ("build" directory in the project root)`))
      return
    }

    Promise.all([this.projectInfoManager.infoFile.value, getZstd()])
      .then(results => {
        const infoFile = results[0]
        log.info("compressing and uploading to remote builder")
        const compressAndUploadTimer = new DevTimer("compress and upload")
        // noinspection SpellCheckingInspection
        const tarProcess = spawn(path7za, [
          "a", "dummy", "-ttar", "-so",
          this.unpackedDirectory,
          infoFile,
          buildResourcesDir,
        ], {
          stdio: ["pipe", "pipe", process.stderr],
        })
        tarProcess.stdout.on("error", reject)

        const zstdProcess = spawn(results[1], [`-${zstdCompressionLevel}`, "--long"], {
          stdio: ["pipe", "pipe", process.stderr],
        })
        zstdProcess.on("error", reject)
        tarProcess.stdout.pipe(zstdProcess.stdin)
        zstdProcess.stdout.pipe(stream)

        zstdProcess.stdout.on("end", () => {
          log.info({time: compressAndUploadTimer.endAndGet()}, "uploaded to remote builder")
        })
      })
      .catch(reject)
  }
}

function getZstdCompressionLevel(endpoint: string): string {
  const result = process.env.ELECTRON_BUILD_SERVICE_ZSTD_COMPRESSION
  if (result != null) {
    return result
  }
  // 18 - 40s
  // 17 - 30s
  // 16 - 20s
  return endpoint.startsWith("https://127.0.0.1:") || endpoint.startsWith("https://localhost:") || endpoint.startsWith("[::1]:") ? "3" : "16"
}

export function checkStatus(status: number, reject: (error: Error) => void) {
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