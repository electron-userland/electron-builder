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
    result.push(line.replace(/\[([^\]]+)\]\(#([^)]+)\)/g, (_match, text, anchor) => {
      const slug = slugify(anchor)
      return headings.has(slug) ? `[${text}](#${slug})` : text
    }))
  }

  const updated = result.join("\n")
  if (updated !== original) { writeFileSync(filePath, updated, "utf-8"); totalFiles++ }
}

console.log(`Fixed anchor links in ${totalFiles} TypeDoc files.`)
