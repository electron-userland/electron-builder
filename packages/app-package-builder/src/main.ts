import { createDifferentialPackage } from "./blockMap"

export { createDifferentialPackage, createPackageFileInfo } from "./blockMap"

if (process.mainModule === module) {
  const a = "source-"
  require(a + "map-support").install()

  async function main() {
    const file = "/Volumes/test/electron-builder-test/dist/nsis-web/TestApp-1.0.1-x64.nsis.7z"
    await createDifferentialPackage(file)
    // const archive = await file.read()
    // for (const entry of archive.files) {
    //   let output = entry.name
    //   if (entry.isDirectory) {
    //     output += " dir"
    //   }
    //   else {
    //     output += ` ${entry.size}`
    //   }
    //   console.log(output)
    // }
  }

  main()
    .catch(error => {
      console.error((error.stack || error).toString())
      process.exit(-1)
    })
}