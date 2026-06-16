import { execSync } from "node:child_process"
import { cpSync, existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import type { LoadContext, Plugin } from "@docusaurus/types"

function generateCliDocs(siteDir: string): void {
  const root = join(siteDir, "..")
  const help = execSync("node packages/electron-builder/dist/cli/cli.js --help", {
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

function prepareDocs(siteDir: string): void {
  const root = join(siteDir, "..")
  const readme = readFileSync(join(root, "README.md"), "utf8")
  // Rewrite repo-relative static asset paths (valid on GitHub) to site-root paths (valid in Docusaurus)
  const rewritten = readme.replaceAll("website/static/", "/")
  const introduction = `---\nslug: /\ntitle: "electron-builder"\n---\n\n${rewritten}`
  writeFileSync(join(siteDir, "docs/introduction.md"), introduction)

  // Copy pagefind from a previous build into static/ so dev-server search works
  const pagefindSrc = join(siteDir, "build/pagefind")
  const pagefindDest = join(siteDir, "static/pagefind")
  if (existsSync(pagefindSrc)) {
    cpSync(pagefindSrc, pagefindDest, { recursive: true })
  }
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
}

function extractHeadingSlugs(content: string): Set<string> {
  const slugs = new Set<string>()
  let inCode = false
  for (const line of content.split("\n")) {
    if (line.startsWith("```")) {
      inCode = !inCode
      continue
    }
    if (inCode) continue
    const m = line.match(/^#{1,6}\s+(.+)$/)
    if (m) slugs.add(slugify(m[1]))
  }
  return slugs
}

function fixTypedocAnchors(siteDir: string): void {
  const apiDir = join(siteDir, "docs/api")
  let totalFiles = 0

  for (const file of readdirSync(apiDir).filter(f => f.endsWith(".md"))) {
    const filePath = join(apiDir, file)
    const raw = readFileSync(filePath, "utf-8")

    // Strip TypeDoc breadcrumbs — handles both plain-text and link-wrapped formats:
    // "Documentation / pkg / Symbol" and "[Documentation](url) / [pkg](url) / Symbol"
    let original = raw.replace(/^(?:\[Documentation\]\([^)]*\)|Documentation) \/ [^\n]*\n\n?/, "")

    const headings = extractHeadingSlugs(original)

    let inCode = false
    const result: string[] = []
    for (const line of original.split("\n")) {
      if (line.startsWith("```")) {
        inCode = !inCode
        result.push(line)
        continue
      }
      if (inCode) {
        result.push(line)
        continue
      }
      let fixed = line.replace(/\[([^\]]+)\]\(#([^)]+)\)/g, (_match, text, anchor) => {
        const slug = slugify(anchor)
        return headings.has(slug) ? `[${text}](#${slug})` : text
      })
      fixed = fixed.replace(/\[([^\]]+)\]\((?:\.\/)?([^)#/]+)\.md(#[^)]*)?\)/g, (_match, text, filename, anchor = "") => `[${text}](/docs/api/${filename}${anchor})`)
      result.push(fixed)
    }

    const afterLinePasses = result.join("\n")
    const updated = afterLinePasses.replace(
      /\[([^\]]+)\]\((?:\.\/)?([^)#/]+)\.md(#[^)]*)?\)/g,
      (_match, text, filename, anchor = "") => `[${text}](/docs/api/${filename}${anchor})`
    )
    if (updated !== raw) {
      writeFileSync(filePath, updated, "utf-8")
      totalFiles++
    }
  }

  console.log(`Fixed anchor links in ${totalFiles} TypeDoc files.`)
}

function generateApiIndex(siteDir: string): void {
  const root = join(siteDir, "..")
  const apiDir = join(siteDir, "docs/api")

  // Package-level files have no dot in the base name (only hyphens), unlike symbol files (e.g. app-builder-lib.Class.AppInfo.md)
  const pkgNames = readdirSync(apiDir)
    .filter(f => f.endsWith(".md") && f !== "index.md" && f !== "packages.md")
    .filter(f => !f.slice(0, -3).includes("."))
    .map(f => f.slice(0, -3))
    .sort()

  const rows = pkgNames.map(pkg => {
    let desc = ""
    try {
      const pkgJson = JSON.parse(readFileSync(join(root, "packages", pkg, "package.json"), "utf-8")) as { description?: string }
      desc = pkgJson.description ?? ""
    } catch {}
    return `| [\`${pkg}\`](./${pkg}) | ${desc} |`
  })

  const content = ["# API Reference", "", "| Package | Description |", "|---|---|", ...rows, ""].join("\n")
  writeFileSync(join(apiDir, "index.md"), content, "utf-8")
}

export default async function prebuildPlugin(context: LoadContext): Promise<Plugin> {
  const { siteDir } = context

  // Run CLI --help and inject output into docs, and prepare other docs before TypeDoc generates API reference
  generateCliDocs(siteDir)
  prepareDocs(siteDir)

  // Clean up old API docs to prevent stale files from remaining if APIs are removed
  rmSync(join(siteDir, "docs/api"), { recursive: true, force: true })

  execSync("node_modules/.bin/typedoc --options typedoc.json", {
    cwd: siteDir,
    encoding: "utf-8",
    stdio: "inherit",
  })

  fixTypedocAnchors(siteDir)
  generateApiIndex(siteDir)

  return {
    name: "electron-builder-prebuild",
    postBuild({ outDir }) {
      execSync(`node_modules/.bin/pagefind --site "${outDir}"`, {
        cwd: siteDir,
        stdio: "inherit",
      })
    },
  }
}
