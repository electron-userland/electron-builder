import { rebuild, RebuildOptions } from "@electron/rebuild"

if (!process.send) {
  console.error("The remote rebuilder expects to be spawned with an IPC channel")
  // eslint-disable-next-line no-process-exit
  process.exit(1)
}

const options: RebuildOptions = JSON.parse(process.argv[2])

const rebuilder = rebuild(options)

rebuilder.lifecycle.on("module-found", () => process.send?.({ msg: "module-found" }))
rebuilder.lifecycle.on("module-done", () => process.send?.({ msg: "module-done" }))

rebuilder
  .then(() => {
    process.send?.({ msg: "rebuild-done" })
    // eslint-disable-next-line no-process-exit
    return process.exit(0)
  })
  .catch(err => {
    process.send?.({
      msg: "rebuild-error",
      err: {
        message: err.message,
        stack: err.stack,
      },
    })
    // eslint-disable-next-line no-process-exit
    process.exit(0)
  })
