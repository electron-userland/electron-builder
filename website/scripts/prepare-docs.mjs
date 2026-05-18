import { cpSync, existsSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const root = join(dirname(fileURLToPath(import.meta.url)), "../..")

const readme = readFileSync(join(root, "README.md"), "utf8")

const introduction = `---\nslug: /\ntitle: "electron-builder"\n---\n\n${readme}`.replaceAll("https://www.electron.build", "")

writeFileSync(join(root, "website/docs/introduction.md"), introduction)

const pagefindSrc = join(root, "website/build/pagefind")
const pagefindDest = join(root, "website/static/pagefind")
if (existsSync(pagefindSrc)) {
  cpSync(pagefindSrc, pagefindDest, { recursive: true })
}
