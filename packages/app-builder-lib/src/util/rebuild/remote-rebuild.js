"use strict"

if (!process.send) {
  console.error("The remote rebuilder expects to be spawned with an IPC channel")
  process.exit(1)
}

const options = JSON.parse(process.argv[2])

function rebuilder(rebuilder) {
  rebuilder.lifecycle.on("module-found", (moduleName) => process.send?.({ msg: "module-found", moduleName }))
  rebuilder.lifecycle.on("module-done", (moduleName) => process.send?.({ msg: "module-done", moduleName }))
  rebuilder.lifecycle.on("module-skip", (moduleName) => process.send?.({ msg: "module-skip", moduleName }))

  rebuilder
    .then(() => {
      process.send?.({ msg: "rebuild-done" })
      return process.exit(0)
    })
    .catch((err) => {
      process.send?.({
        msg: "rebuild-error",
        err: {
          message: err.message,
          stack: err.stack,
        },
      })
      process.exit(0)
    })
}

rebuilder(require("@electron/rebuild").rebuild(options))

// void import("@electron/rebuild").then(module => {
//   rebuilder(module.rebuild(options))
// })
