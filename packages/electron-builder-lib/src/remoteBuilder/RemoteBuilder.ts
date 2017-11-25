import { debug } from "builder-util"
import { httpExecutor } from "builder-util/out/nodeHttpExecutor"
import { PlatformPackager } from "../platformPackager"
import { RemoteBuildManager } from "./RemoteBuildManager"

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
    hostname: process.env.ELECTRON_BUILD_SERVICE_ROUTER_HOST || "www.electron.build",
    // add random query param to prevent caching
    path: `/find-build-agent?c=${Date.now().toString(32)}`,
  }))!!)
  return agentInfo.endpoint
}

export interface RemoteBuilderResponse {
  error?: string
}