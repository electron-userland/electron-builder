if (!process.send) {
  console.error("The remote rebuilder expects to be spawned with an IPC channel")
  process.exit(1)
}

function rebuilder(rebuilder: any): void {
  rebuilder.lifecycle.on("module-found", (moduleName: any) => process.send?.({ msg: "module-found", moduleName }))
  rebuilder.lifecycle.on("module-done", (moduleName: any) => process.send?.({ msg: "module-done", moduleName }))
  rebuilder.lifecycle.on("module-skip", (moduleName: any) => process.send?.({ msg: "module-skip", moduleName }))

  rebuilder
    .then(() => {
      process.send?.({ msg: "rebuild-done" })
      return process.exit(0)
    })
    .catch((err: { message: string; stack: string }) => {
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

// eslint-disable-next-line @typescript-eslint/no-implied-eval
const dynamicImport = new Function("specifier", "return import(specifier)")

const main = () => {
  const options = JSON.parse(process.argv[2])

  // crazy hack to retain dynamic import, while calling an ESM function from CJS context
  return dynamicImport("@electron/rebuild").then((module: any) => {
    const { rebuild } = module
    return rebuilder(rebuild(options))
  })
}

main()
