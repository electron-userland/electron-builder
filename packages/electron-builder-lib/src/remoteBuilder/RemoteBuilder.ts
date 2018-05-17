import BluebirdPromise from "bluebird-lst"
import { Arch, isEnvTrue, log } from "builder-util"
import { connect, constants } from "http2"
import * as path from "path"
import { promisify } from "util"
import { Target } from "../core"
import { PlatformPackager } from "../platformPackager"
import { ProjectInfoManager } from "./ProjectInfoManager"
import { ArtifactInfo, checkStatus, getConnectOptions, RemoteBuildManager } from "./RemoteBuildManager"

interface TargetInfo {
  name: string
  arch: string
  unpackedDirectory: string
  outDir: string
}

const errorCodes = new Set(["ECONNREFUSED", "ECONNRESET"])

export class RemoteBuilder {
  private readonly toBuild = new Map<Arch, Array<TargetInfo>>()
  private buildStarted = false

  constructor(readonly packager: PlatformPackager<any>) {
  }

  scheduleBuild(target: Target, arch: Arch, unpackedDirectory: string) {
    if (!isEnvTrue(process.env._REMOTE_BUILD) && this.packager.config.remoteBuild === false) {
      throw new Error("Target is not supported on your OS and using of Electron Build Service is disabled (\"remoteBuild\" option)")
    }

    let list = this.toBuild.get(arch)
    if (list == null) {
      list = []
      this.toBuild.set(arch, list)
    }

    list.push({
      name: target.name,
      arch: Arch[arch],
      unpackedDirectory,
      outDir: target.outDir,
    })
  }

  build(): Promise<any> {
    if (this.buildStarted) {
      return Promise.resolve()
    }

    this.buildStarted = true

    return BluebirdPromise.mapSeries(Array.from(this.toBuild.keys()), (arch: Arch) => {
      return this._build(this.toBuild.get(arch)!!, this.packager)
    })
  }

  // noinspection JSMethodCanBeStatic
  private async _build(targets: Array<TargetInfo>, packager: PlatformPackager<any>): Promise<any> {
    if (log.isDebugEnabled) {
      log.debug({remoteTargets: JSON.stringify(targets, null, 2)}, "remote building")
    }

    const projectInfoManager = new ProjectInfoManager(packager.info)

    let result: RemoteBuilderResponse | null = null
    for (let attempt = 0; true; attempt++) {
      const endpoint = await findBuildAgent()
      // for now assume that all targets has the same outDir (correct for Linux)
      const buildManager = new RemoteBuildManager(endpoint, projectInfoManager, targets[0].unpackedDirectory, targets[0].outDir, packager)
      const setTimeoutPromise = promisify(setTimeout)
      try {
        result = await buildManager.build({
          "x-build-request": JSON.stringify({
            targets: targets.map(it => {
              return {
                name: it.name,
                arch: it.arch,
                unpackedDirName: path.basename(it.unpackedDirectory),
              }
            }),
            platform: packager.platform.buildConfigurationKey,
          })
        })
        break
      }
      catch (e) {
        const errorCode: string = e.code
        if (!errorCodes.has(errorCode) || attempt > 3) {
          if (errorCode === "ECONNREFUSED") {
            const error = new Error(`Cannot connect to electron build service ${endpoint}: ${e.message}`)
            e.code = errorCode
            throw error
          }
          else {
            throw e
          }
        }

        const waitTime = 4000 * (attempt + 1)
        console.warn(`Attempt ${attempt + 1}: ${e.message}\nWaiting ${waitTime / 1000}s...`)
        await setTimeoutPromise(waitTime, "wait")
      }
    }

    if (result != null && result.error != null) {
      throw new Error(`Remote builder error (if you think that it is not your application misconfiguration issue, please file issue to https://github.com/electron-userland/electron-builder/issues):\n\n${result.error}`)
    }
  }
}

async function findBuildAgent(): Promise<string> {
  const result = process.env.ELECTRON_BUILD_SERVICE_ENDPOINT
  if (result != null) {
    log.debug({endpoint: result}, `endpoint is set explicitly`)
    return result.startsWith("http") ? result : `https://${result}`
  }

  const rawUrl = process.env.ELECTRON_BUILD_SERVICE_ROUTER_HOST || "206.189.255.57"
  // add random query param to prevent caching
  const routerUrl = rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`
  log.debug({routerUrl}, "")
  const client = connect(routerUrl, getConnectOptions())
  return await new BluebirdPromise<string>((resolve, reject) => {
    client.on("socketError", reject)
    client.on("error", reject)
    client.setTimeout(10 * 1000, () => {
      reject(new Error("Timeout"))
    })

    const stream = client.request({
      [constants.HTTP2_HEADER_PATH]: `/find-build-agent?c=${Date.now().toString(32)}`,
      [constants.HTTP2_HEADER_METHOD]: constants.HTTP2_METHOD_GET,
    })
    stream.on("error", reject)

    stream.on("response", headers => {
      if (!checkStatus(headers[constants.HTTP2_HEADER_STATUS] as any, reject)) {
        return
      }

      stream.setEncoding("utf8")
      let data = ""
      stream.on("end", () => {
        try {
          if (log.isDebugEnabled) {
            log.debug({data}, "remote build response")
          }
          resolve(JSON.parse(data).endpoint)
        }
        catch (e) {
          throw new Error(`Cannot parse response: ${data}`)
        }
      })
      stream.on("data", (chunk: string) => {
        data += chunk
      })
    })
  })
    .finally(() => {
      client.destroy()
    })
}

export interface RemoteBuilderResponse {
  files: Array<ArtifactInfo> | null
  error: string | null
}