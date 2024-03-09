import * as cp from "child_process"
import * as path from "path"
import { RebuildOptions } from "@electron/rebuild"
import { log } from "builder-util"

export const rebuild = async (options: RebuildOptions): Promise<void> => {
  log.info(`Installing native dependencies`)

  const child = cp.fork(path.resolve(__dirname, "remote-rebuild.js"), [JSON.stringify(options)], {
    stdio: ["pipe", "pipe", "pipe", "ipc"],
  })

  let pendingError: Error

  child.stdout?.on("data", chunk => {
    log.info(chunk.toString())
  })
  child.stderr?.on("data", chunk => {
    log.error(chunk.toString())
  })

  child.on("message", (message: { msg: string; moduleName: string; err: { message: string; stack: string } }) => {
    const { moduleName, msg } = message
    switch (msg) {
      case "module-found": {
        log.info({ moduleName }, "Preparing")
        break
      }
      case "module-done": {
        log.info({ moduleName }, "Finished")
        break
      }
      case "module-skip": {
        log.debug?.({ moduleName }, "Skipped")
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
