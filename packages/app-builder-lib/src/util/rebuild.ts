import { RebuildOptions } from "@electron/rebuild"
import { ELECTRON_BUILDER_SIGNALS, log } from "builder-util"
import * as cp from "child_process"
import * as path from "path"

export const rebuild = async (options: RebuildOptions): Promise<void> => {
  const { arch } = options
  log.info(ELECTRON_BUILDER_SIGNALS.NATIVE_REBUILD, { arch }, `installing native dependencies`)

  const child = cp.fork(path.resolve(__dirname, "../../helpers/remote-rebuild.js"), [JSON.stringify(options)], {
    stdio: ["pipe", "pipe", "pipe", "ipc"],
  })

  let pendingError: Error

  child.stdout?.on("data", chunk => {
    log.info(ELECTRON_BUILDER_SIGNALS.NATIVE_REBUILD, null, chunk.toString())
  })
  child.stderr?.on("data", chunk => {
    log.error(ELECTRON_BUILDER_SIGNALS.NATIVE_REBUILD, null, chunk.toString())
  })

  child.on("message", (message: { msg: string; moduleName: string; err: { message: string; stack: string } }) => {
    const { moduleName, msg } = message
    switch (msg) {
      case "module-found": {
        log.info(ELECTRON_BUILDER_SIGNALS.NATIVE_REBUILD, { moduleName, arch }, "preparing")
        break
      }
      case "module-done": {
        log.info(ELECTRON_BUILDER_SIGNALS.NATIVE_REBUILD, { moduleName, arch }, "finished")
        break
      }
      case "module-skip": {
        log.debug(ELECTRON_BUILDER_SIGNALS.NATIVE_REBUILD, { moduleName, arch }, "skipped. set ENV=electron-rebuild to determine why")
        break
      }
      case "rebuild-error": {
        pendingError = new Error(message.err.message)
        pendingError.stack = message.err.stack
        break
      }
      case "rebuild-done": {
        log.info(ELECTRON_BUILDER_SIGNALS.NATIVE_REBUILD, null, "completed installing native dependencies")
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
