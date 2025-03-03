import { AsarFilesystem, readAsar } from "app-builder-lib/out/asar/asar"
import { walk } from "builder-util"
import { readFileSync } from "fs"
import * as path from "path"
import { toSystemIndependentPath } from "./packTester"
import { ExpectStatic } from "vitest"

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

export async function verifySmartUnpack(expect: ExpectStatic, resourceDir: string, additionalVerifications?: (asarFs: AsarFilesystem) => Promise<void>) {
  const asarFs = await readAsar(path.join(resourceDir, "app.asar"))
  expect(await asarFs.readJson(`node_modules${path.sep}debug${path.sep}package.json`)).toMatchObject({
    name: "debug",
  })

  // For verifying additional files within the Asar Filesystem
  await additionalVerifications?.(asarFs)

  expect(removeUnstableProperties(asarFs.header)).toMatchSnapshot()

  const files = (await walk(resourceDir, file => !path.basename(file).startsWith(".") && !file.endsWith(`resources${path.sep}inspector`))).map(it => {
    const name = toSystemIndependentPath(it.substring(resourceDir.length + 1))
    if (it.endsWith("package.json")) {
      return { name, content: readFileSync(it, "utf-8") }
    }
    return name
  })
  expect(files).toMatchSnapshot()
}
