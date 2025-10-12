if (!process.send) {
  console.error("The remote rebuilder expects to be spawned with an IPC channel")
  process.exit(1)
}

const rebuilder = rebuilder => {
  rebuilder.lifecycle.on("module-found", moduleName => process.send?.({ msg: "module-found", moduleName }))
  rebuilder.lifecycle.on("module-done", moduleName => process.send?.({ msg: "module-done", moduleName }))
  rebuilder.lifecycle.on("module-skip", moduleName => process.send?.({ msg: "module-skip", moduleName }))

  return rebuilder
    .then(() => {
      process.send?.({ msg: "rebuild-done" })
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
      process.exit(0)
    })
}

const main = () => {
  const options = JSON.parse(process.argv[2])

  const dynamicImport = require("./dynamic-import").dynamicImportMaybe
  return dynamicImport("@electron/rebuild").then(module => {
    const { rebuild } = module
    return rebuilder(rebuild(options))
  })
}

main()
