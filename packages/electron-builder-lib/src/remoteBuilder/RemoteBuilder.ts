import { debug, Arch } from "builder-util"
import { httpExecutor } from "builder-util/out/nodeHttpExecutor"
import { promisify } from "util"
import { Target } from "../core"
import { PlatformPackager } from "../platformPackager"
import { ProjectInfoManager } from "./ProjectInfoManager"
import { RemoteBuildManager } from "./RemoteBuildManager"
import * as path from "path"

interface TargetInfo {
  name: string
  arch: string
  unpackedDirName: string
}

export class RemoteBuilder {
  buildTarget(target: Target, arch: Arch, unpackedDirectory: string, packager: PlatformPackager<any>): Promise<any> {
    return this.build([{
      name: target.name,
      arch: Arch[arch],
      unpackedDirName: path.basename(unpackedDirectory)
    }], unpackedDirectory, packager, target.outDir)
  }

  // noinspection JSMethodCanBeStatic
  private async build(targets: Array<TargetInfo>, unpackedDirectory: string, packager: PlatformPackager<any>, outDir: string): Promise<any> {
    const projectInfoManager = new ProjectInfoManager(packager.info)

    let result: RemoteBuilderResponse | null = null
    for (let attempt = 0; true; attempt++) {
      const endpoint = await findBuildAgent()
      const buildManager = new RemoteBuildManager(endpoint, projectInfoManager, unpackedDirectory, outDir, packager)
      const setTimeoutPromise = promisify(setTimeout)
      try {
        result = await buildManager.build({
          "x-targets": JSON.stringify(targets),
          "x-platform": packager.platform.buildConfigurationKey,
        })
        break
      }
      catch (e) {
        if (e.code !== "ECONNRESET" || attempt > 3) {
          throw e
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
    debug(`Remote build endpoint set explicitly: ${result}`)
    return result.startsWith("http") ? result : `https://${result}`
  }

  const agentInfo = JSON.parse((await httpExecutor.request({
    hostname: process.env.ELECTRON_BUILD_SERVICE_ROUTER_HOST || "www.electron.build",
    // add random query param to prevent caching
    path: `/find-build-agent?c=${Date.now().toString(32)}`,
  }))!!)
  return agentInfo.endpoint
}

export interface RemoteBuilderResponse {
  error?: string
}