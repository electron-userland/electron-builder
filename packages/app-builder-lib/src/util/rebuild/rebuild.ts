import * as cp from "child_process"
import * as path from "path"
import { RebuildOptions } from "@electron/rebuild"
import { log } from "builder-util"

export const rebuild = async (buildPath: string, electronVersion: string, platform: NodeJS.Platform, arch: string, config: Partial<RebuildOptions> = {}): Promise<void> => {
  log.info(`Preparing native dependencies`)

  const options: RebuildOptions = {
    ...config,
    buildPath,
    electronVersion,
    arch,
  }

  const child = cp.fork(path.resolve(__dirname, "remote-rebuild.js"), [JSON.stringify(options)], {
    stdio: ["pipe", "pipe", "pipe", "ipc"],
  })

  let pendingError: Error
  let found = 0
  let done = 0

  const redraw = () => {
    log.info(`Preparing native dependencies: ${done} / ${found}`)
  }

  child.stdout?.on("data", chunk => {
    log.info(chunk.toString())
  })
  child.stderr?.on("data", chunk => {
    log.error(chunk.toString())
  })

  child.on("message", (message: { msg: string; err: { message: string; stack: string } }) => {
    switch (message.msg) {
      case "module-found": {
        found += 1
        redraw()
        break
      }
      case "module-done": {
        done += 1
        redraw()
        break
      }
      case "rebuild-error": {
        pendingError = new Error(message.err.message)
        pendingError.stack = message.err.stack
        break
      }
      case "rebuild-done": {
        log.info("Completed installing native dependencies")
        break
      }
    }
  })

  await new Promise<void>((resolve, reject) => {
    child.on("exit", code => {
      if (code === 0 && !pendingError) {
        resolve()
      } else {
        reject(pendingError || new Error(`Rebuilder failed with exit code: ${code}`))
      }
    })
  })
}
