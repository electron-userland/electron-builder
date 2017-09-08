import { createDifferentialPackage } from "./blockMap"

export { createDifferentialPackage, createPackageFileInfo } from "./blockMap"

if (process.mainModule === module) {
  const a = "source-"
  require(a + "map-support").install()

  async function main() {
    // const file = new SevenZFile("/Users/develar/Documents/onshape-desktop-shell/dist/Onshape-0.5.13-x64.nsis.7z")
    const file = "/Users/develar/Documents/onshape-desktop-shell/dist/Onshape-0.5.13-x64.nsis.7z"
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