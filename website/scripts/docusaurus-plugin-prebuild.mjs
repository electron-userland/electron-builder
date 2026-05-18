import { execSync } from "node:child_process"
import { cpSync, existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"

function generateCliDocs(siteDir) {
  const root = join(siteDir, "..")
  const help = execSync("node packages/electron-builder/out/cli/cli.js --help", {
    encoding: "utf-8",
    cwd: root,
  })
  const helpBlock = `\`\`\`\n${help.trimEnd().replaceAll("cli.js", "electron-builder")}\n\`\`\``
  const dest = join(siteDir, "docs/cli.md")
  const content = readFileSync(dest, "utf-8")
  const start = "<!-- HELP_OUTPUT_START -->"
  const end = "<!-- HELP_OUTPUT_END -->"
  const si = content.indexOf(start)
  const ei = content.indexOf(end)
  if (si === -1 || ei === -1) throw new Error(`Markers ${start} / ${end} not found in ${dest}`)
  writeFileSync(dest, content.slice(0, si + start.length) + "\n" + helpBlock + "\n" + content.slice(ei))
}

function prepareDocs(siteDir) {
  const root = join(siteDir, "..")
  const readme = readFileSync(join(root, "README.md"), "utf8")
  const introduction = `---\nslug: /\ntitle: "electron-builder"\n---\n\n${readme}`.replaceAll("https://www.electron.build", "")
  writeFileSync(join(siteDir, "docs/introduction.md"), introduction)

  // Copy pagefind from a previous build into static/ so dev-server search works
  const pagefindSrc = join(siteDir, "build/pagefind")
  const pagefindDest = join(siteDir, "static/pagefind")
  if (existsSync(pagefindSrc)) {
    cpSync(pagefindSrc, pagefindDest, { recursive: true })
  }
}

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
}

function extractHeadingSlugs(content) {
  const slugs = new Set()
  let inCode = false
  for (const line of content.split("\n")) {
    if (line.startsWith("```")) { inCode = !inCode; continue }
    if (inCode) continue
    const m = line.match(/^#{1,6}\s+(.+)$/)
    if (m) slugs.add(slugify(m[1]))
  }
  return slugs
}

function fixTypedocAnchors(siteDir) {
  const apiDir = join(siteDir, "docs/api")
  let totalFiles = 0

  for (const file of readdirSync(apiDir).filter((f) => f.endsWith(".md"))) {
    const filePath = join(apiDir, file)
    const original = readFileSync(filePath, "utf-8")
    const headings = extractHeadingSlugs(original)

    let inCode = false
    const result = []
    for (const line of original.split("\n")) {
      if (line.startsWith("```")) { inCode = !inCode; result.push(line); continue }
      if (inCode) { result.push(line); continue }
      let fixed = line.replace(/\[([^\]]+)\]\(#([^)]+)\)/g, (_match, text, anchor) => {
        const slug = slugify(anchor)
        return headings.has(slug) ? `[${text}](#${slug})` : text
      })
      fixed = fixed.replace(/\[([^\]]+)\]\((?!https?:\/\/)([^)]+\.md[^)]*)\)/g, (_match, text) => text)
      result.push(fixed)
    }

    const afterLinePasses = result.join("\n")
    const updated = afterLinePasses.replace(/\[([^\]]+)\]\((?!https?:\/\/)([^)]+\.md[^)]*)\)/g, (_match, text) => text)
    if (updated !== original) { writeFileSync(filePath, updated, "utf-8"); totalFiles++ }
  }

  console.log(`Fixed anchor links in ${totalFiles} TypeDoc files.`)
}

/** @param {{ siteDir: string }} context */
export default async function prebuildPlugin(context) {
  const { siteDir } = context

  generateCliDocs(siteDir)
  prepareDocs(siteDir)

  rmSync(join(siteDir, "docs/api"), { recursive: true, force: true })

  const { Application } = await import("typedoc")
  const app = await Application.bootstrapWithPlugins({
    options: join(siteDir, "typedoc.json"),
  })
  const project = await app.convert()
  if (!project) throw new Error("TypeDoc failed to convert project")
  await app.generateDocs(project, join(siteDir, "docs/api"))

  fixTypedocAnchors(siteDir)

  return {
    name: "electron-builder-prebuild",
    async postBuild({ outDir }) {
      const { createIndex } = await import("pagefind")
      const { index } = await createIndex()
      await index.addDirectory({ path: outDir })
      await index.writeFiles({ outputPath: join(outDir, "pagefind") })
    },
  }
}
