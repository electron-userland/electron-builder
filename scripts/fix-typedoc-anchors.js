"use strict"
/**
 * Post-processes TypeDoc-generated Markdown files in website/docs/api/ to fix
 * broken anchor links in Docusaurus:
 *   1. Converts self-referential camelCase anchor links to lowercase
 *   2. Removes links to anchors that don't exist as headings in the same file
 *
 * Run after TypeDoc generation (or add to the Docker build pipeline).
 * Usage: node scripts/fix-typedoc-anchors.js
 */
const { readFileSync, writeFileSync, readdirSync } = require("fs")
const { join } = require("path")

const apiDir = join(__dirname, "..", "website", "docs", "api")

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
}

/** Extract all heading slugs from a Markdown file (outside code blocks). */
function extractHeadingSlugs(content) {
  const slugs = new Set()
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

const files = readdirSync(apiDir).filter((f) => f.endsWith(".md"))
let totalFiles = 0

for (const file of files) {
  const filePath = join(apiDir, file)
  const original = readFileSync(filePath, "utf-8")
  const headings = extractHeadingSlugs(original)

  let updated = original
  let inCode = false
  const lines = updated.split("\n")
  const result = []

  for (const line of lines) {
    if (line.startsWith("```")) {
      inCode = !inCode
      result.push(line)
      continue
    }
    if (inCode) {
      result.push(line)
      continue
    }
    // Fix self-referential anchor links: [text](#Anchor) -> [text](#anchor-slug)
    const fixed = line.replace(/\[([^\]]+)\]\(#([^)]+)\)/g, (_match, text, anchor) => {
      const slug = slugify(anchor)
      if (headings.has(slug)) {
        return `[${text}](#${slug})`
      }
      // Anchor doesn't exist in this file — strip the link, keep the text
      return text
    })
    result.push(fixed)
  }

  updated = result.join("\n")
  if (updated !== original) {
    writeFileSync(filePath, updated, "utf-8")
    totalFiles++
  }
}

console.log(`Fixed anchor links in ${totalFiles} TypeDoc files.`)
