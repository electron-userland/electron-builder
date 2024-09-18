import { copy, exists } from "fs-extra"
import { rm } from "fs/promises"
import * as path from "path"
import * as typedoc from "typedoc"

async function main() {
  const outputDir = "docs"
  const dest = path.resolve(process.cwd(), outputDir)

  const origin = path.resolve(process.cwd(), "pages")
  console.log("copying from", origin, dest)
  const siteDir = path.resolve(process.cwd(), "site")

  if (await exists(siteDir)) {
    await rm(siteDir, { recursive: true })
  }
  if (await exists(dest)) {
    await rm(dest, { recursive: true })
  }
  await copy(origin, dest)
  await copy(path.resolve(process.cwd(), "./README.md"), path.resolve(dest, "README.md"))

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

main().catch(console.error)
