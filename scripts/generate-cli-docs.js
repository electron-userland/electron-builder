"use strict"
/**
 * Generates the --help output section of website/docs/cli.md.
 * Replaces content between HELP_OUTPUT_START and HELP_OUTPUT_END markers.
 * Requires packages to be compiled first: pnpm compile
 */
const { execSync } = require("child_process")
const { readFileSync, writeFileSync } = require("fs")
const { join } = require("path")

const out = execSync("node ./packages/electron-builder/out/cli/cli.js --help", {
  encoding: "utf-8",
  cwd: join(__dirname, "../"),
})

const helpBlock = `\`\`\`\n${out.trimEnd().replaceAll("cli.js", "electron-builder")}\n\`\`\``

const dest = join(__dirname, "..", "website", "docs", "cli.md")
const existing = readFileSync(dest, "utf-8")

const start = "<!-- HELP_OUTPUT_START -->"
const end = "<!-- HELP_OUTPUT_END -->"
const startIdx = existing.indexOf(start)
const endIdx = existing.indexOf(end)

if (startIdx === -1 || endIdx === -1) {
  throw new Error(`Markers ${start} / ${end} not found in ${dest}`)
}

const updated = existing.slice(0, startIdx + start.length) + "\n" + helpBlock + "\n" + existing.slice(endIdx)
writeFileSync(dest, updated, "utf-8")
console.log(`Updated ${dest}`)
