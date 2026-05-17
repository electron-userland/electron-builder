/**
 * One-off script to convert MkDocs admonitions to Docusaurus :::type syntax.
 * Run once, then delete.
 *
 * MkDocs:   !!! warning "Title"
 *               Content indented 4 spaces
 *
 * Docusaurus: :::warning[Title]
 *             Content
 *             :::
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs"
import { join, extname, relative } from "node:path"
import { fileURLToPath } from "node:url"
import { dirname } from "node:path"

const __dirname = dirname(fileURLToPath(import.meta.url))
const docsDir = join(__dirname, "..", "docs")

const TYPE_MAP = {
  note: "note",
  info: "info",
  tip: "tip",
  warning: "warning",
  danger: "danger",
  example: "note",
  success: "tip",
  question: "note",
}

function getFiles(dir, skip = []) {
  const files = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (skip.some((s) => full.startsWith(s))) continue
    if (statSync(full).isDirectory()) {
      files.push(...getFiles(full, skip))
    } else if (extname(full) === ".md") {
      files.push(full)
    }
  }
  return files
}

function convertAdmonitions(content) {
  const lines = content.split("\n")
  const result = []
  let i = 0
  let changed = false

  while (i < lines.length) {
    const line = lines[i]
    // Match !!! type "optional title" or ??? type "optional title"
    // Also handles unquoted title: !!! info Only for EV signing
    const match = line.match(/^(!{3}|\?{3})\s+(\w+)(?:\s+"([^"]*)"|\s+([^"]+))?$/)

    if (match) {
      const [, marker, rawType, quotedTitle, unquotedTitle] = match
      const title = quotedTitle ?? unquotedTitle?.trim() ?? null
      const isCollapsible = marker === "???"
      const docType = isCollapsible
        ? "details"
        : TYPE_MAP[rawType.toLowerCase()] ?? rawType.toLowerCase()

      // Collect body: lines indented by 4 spaces OR blank lines
      i++
      const bodyLines = []
      while (i < lines.length) {
        const bodyLine = lines[i]
        if (bodyLine.startsWith("    ") || bodyLine === "") {
          bodyLines.push(bodyLine.startsWith("    ") ? bodyLine.slice(4) : "")
          i++
        } else {
          break
        }
      }

      // Trim trailing blank lines from body
      while (bodyLines.length > 0 && bodyLines[bodyLines.length - 1] === "") {
        bodyLines.pop()
      }

      const titlePart = title ? `[${title}]` : ""
      result.push(`:::${docType}${titlePart}`)
      result.push(...bodyLines)
      result.push(":::")
      result.push("")
      changed = true
    } else {
      result.push(line)
      i++
    }
  }

  return { content: result.join("\n"), changed }
}

const skipDirs = [
  join(docsDir, "api"),
]
const skipFiles = [
  join(docsDir, "introduction.md"),
]

const files = getFiles(docsDir, skipDirs).filter((f) => !skipFiles.includes(f))
let totalChanged = 0

for (const file of files) {
  const original = readFileSync(file, "utf-8")
  const { content, changed } = convertAdmonitions(original)
  if (changed) {
    writeFileSync(file, content, "utf-8")
    console.log(`  converted: ${relative(docsDir, file)}`)
    totalChanged++
  }
}

console.log(`\nTotal files converted: ${totalChanged}`)
