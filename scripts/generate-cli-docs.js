"use strict"
/**
 * Generates website/docs/cli.md from `electron-builder --help`.
 * Requires packages to be compiled first: pnpm compile
 */
const { execSync } = require("child_process")
const { writeFileSync } = require("fs")
const { join } = require("path")

const out = execSync("./node_modules/.bin/electron-builder --help", {
  encoding: "utf-8",
  cwd: join(__dirname, ".."),
})

const content = `---
title: CLI
---

\`\`\`
${out.trimEnd()}
\`\`\`
`

const dest = join(__dirname, "..", "website", "docs", "cli.md")
writeFileSync(dest, content, "utf-8")
console.log(`Generated ${dest}`)
