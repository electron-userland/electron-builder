import { readFileSync, writeFileSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { execSync } from "node:child_process"

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, "..")

const BASE = "https://www.electron.build"

// All relative ./foo.md links found in JSDoc comments across packages/*/src/**/*.ts
// Maps exact string → replacement string
const REPLACEMENTS = [
  ["./auto-update.md#appupdatersetfeedurloptions", `${BASE}/auto-update#appupdatersetfeedurloptions`],
  ["./auto-update.md#compatibility", `${BASE}/auto-update#compatibility`],
  ["./auto-update.md#private-github-update-repo", `${BASE}/auto-update#private-github-update-repo`],
  ["./auto-update.md#staged-rollouts", `${BASE}/auto-update#staged-rollouts`],
  ["./code-signing.md", `${BASE}/code-signing`],
  ["./configuration.md#artifact-file-name-template", `${BASE}/configuration#artifact-file-name-template`],
  ["./configuration.md#author", `${BASE}/configuration#author`],
  ["./configuration.md#description", `${BASE}/configuration#description`],
  ["./configuration.md#homepage", `${BASE}/configuration#homepage`],
  ["./configuration.md#metadata", `${BASE}/configuration#metadata`],
  ["./configuration.md#productName", `${BASE}/configuration#productname`],
  ["./configuration.md#product", `${BASE}/configuration#product`],
  ["./contents.md#extraresources", `${BASE}/contents#extraresources`],
  ["./file-patterns.md#file-macros", `${BASE}/file-patterns#file-macros`],
  ["./file-patterns.md", `${BASE}/file-patterns`],
  ["./mas.md", `${BASE}/mas`],
  ["./multi-platform-build.md#docker", `${BASE}/multi-platform-build#docker`],
  ["./nsis.md#guid-vs-application-name", `${BASE}/nsis#guid-vs-application-name`],
  ["./nsis.md#portable", `${BASE}/nsis#portable`],
  ["./publish.md#genericserveroptions", `${BASE}/publish#genericserveroptions`],
  ["./publish.md", `${BASE}/publish`],
  // malformed link in winOptions.ts — missing opening paren
  ["[portable]./nsis.md#portable", `[portable](${BASE}/nsis#portable)`],
]

const srcFiles = execSync(
  `find packages -path "*/src/*.ts" -o -path "*/src/**/*.ts"`,
  { cwd: root, encoding: "utf-8" }
).trim().split("\n").filter(Boolean)

let changed = 0
for (const rel of srcFiles) {
  const abs = join(root, rel)
  let src = readFileSync(abs, "utf-8")
  let modified = src
  for (const [from, to] of REPLACEMENTS) {
    modified = modified.replaceAll(from, to)
  }
  if (modified !== src) {
    writeFileSync(abs, modified, "utf-8")
    console.log(`  updated: ${rel}`)
    changed++
  }
}

console.log(`\nDone. ${changed} file(s) updated.`)
