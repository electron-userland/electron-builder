import { readFileSync, writeFileSync, readdirSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const apiDir = join(dirname(fileURLToPath(import.meta.url)), "../docs/api")

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
    // Fix same-file anchor links: validate against known headings, strip if invalid
    let fixed = line.replace(/\[([^\]]+)\]\(#([^)]+)\)/g, (_match, text, anchor) => {
      const slug = slugify(anchor)
      return headings.has(slug) ? `[${text}](#${slug})` : text
    })
    // Strip cross-file TypeDoc links (e.g. [Foo](other-api-page.md) or [...](other.md#anchor))
    // These target excluded API pages that are never routed, so the link text is kept but the href removed.
    fixed = fixed.replace(/\[([^\]]+)\]\((?!https?:\/\/)([^)]+\.md[^)]*)\)/g, (_match, text) => text)
    result.push(fixed)
  }

  // Whole-file fallback: strip any cross-file links still present (e.g. inside unclosed code fences)
  const afterLinePasses = result.join("\n")
  const updated = afterLinePasses.replace(/\[([^\]]+)\]\((?!https?:\/\/)([^)]+\.md[^)]*)\)/g, (_match, text) => text)
  if (updated !== original) { writeFileSync(filePath, updated, "utf-8"); totalFiles++ }
}

console.log(`Fixed anchor links in ${totalFiles} TypeDoc files.`)
