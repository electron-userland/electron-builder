import { walk } from "builder-util/out/fs"
import { readFileSync } from "fs"
import * as path from "path"
import { toSystemIndependentPath, verifyAsarFileTree } from "./packTester"
import { readAsarFile } from "app-builder-lib/out/asar/integrity"
import { log } from "builder-util"

export function removeUnstableProperties(data: any) {
  return JSON.parse(
    JSON.stringify(data, (name, value) => {
      if (name === "offset") {
        return undefined
      }
      if (value.size != null) {
        // size differs on various OS and subdependencies aren't pinned, so this will randomly fail when subdependency resolution versions change
        value.size = "<size>"
      }
      // Keep existing test coverage
      if (value.integrity) {
        delete value.integrity
      }
      return value
    })
  )
}

export async function verifySmartUnpack(resourceDir: string) {
  const json = readAsarFile(path.join(resourceDir, "app.asar"), `node_modules${path.sep}debug${path.sep}package.json`)
  expect(json).toMatchObject({
    name: "debug",
  })
  // expect(removeUnstableProperties(asarFs.header)).toMatchSnapshot()
  await verifyAsarFileTree(resourceDir)
  const files = (await walk(resourceDir, file => !path.basename(file).startsWith(".") && !file.endsWith(`resources${path.sep}inspector`))).map(it => {
    const name = toSystemIndependentPath(it.substring(resourceDir.length + 1))
    if (it.endsWith("package.json")) {
      return { name, content: readFileSync(it, "utf-8") }
    }
    log.warn( { it, name })
    return name
  })
  expect(files).toMatchSnapshot()
}
