import { copyFile, stat } from "node:fs/promises"
import { rm } from "node:fs/promises"
import * as path from "path"
import * as typedoc from "typedoc"
import * as process from "process"

async function main() {
  const outputDir = "docs"
  const dest = path.resolve(process.cwd(), outputDir)

  const origin = path.resolve(process.cwd(), "pages")
  console.log("copying from", origin, dest)
  const siteDir = path.resolve(process.cwd(), "site")

  if (await stat(siteDir)) {
    await rm(siteDir, { recursive: true })
  }
  if (await stat(dest)) {
    await rm(dest, { recursive: true })
  }
  await copyFile(origin, dest)
  await copyFile(path.resolve(process.cwd(), "./README.md"), path.resolve(dest, "README.md"))

  const typedocConfig: Partial<typedoc.TypeDocOptions> = {
    options: "typedoc.config.js",
  }

  const config = {
    ...typedocConfig,
    flattenOutputFiles: true,
  }
  const app = await typedoc.Application.bootstrapWithPlugins(config)

  const project = await app.convert()

  await app.generateDocs(project!, outputDir)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
