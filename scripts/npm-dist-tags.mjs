#!/usr/bin/env node
// The plan of the npm dist-tag workflow (.github/workflows/npm-dist-tag.yml): what it takes to make npm match the
// dist-tags of .github/npm-dist-tags.yml. Every entry of the file names an electron-builder release; every non-private
// package under packages/ (the pnpm workspace glob packages/**) is tagged with the version it had in that release, read
// from the commit of the git tag electron-builder@<version> (`changeset tag` pushes it on the release commit), so
// electron-updater, builder-util-runtime etc. move together with electron-builder.
//
//   --config <file>    the dist-tags file (default .github/npm-dist-tags.yml)
//   --plan <file>      write the plan there, one line per package and dist-tag: tag, name, version, current version of
//                      the tag on npm ("" when unset), tab-separated, electron-builder last within each dist-tag
//   --summary <file>   append the plan as Markdown (the job summary)
//   --title <text>     heading of that Markdown
//   --remote <name>    git remote to fetch the release tags from (default origin)
//
// Reads only: git (fetches the release tags) and the npm registry (npm view). Fails, writing no plan, when the file is
// not valid, a release has no git tag, or a version is not on npm, so the workflow moves nothing unless every dist-tag
// of the file can be moved. On a pull request the file comes from the fork: nothing of it reaches a shell, and only
// values that passed validation reach the summary.
//
// The functions without I/O are exported for test/src/npmDistTagsTest.ts; importing the file does not run it.
import { execFileSync } from "node:child_process"
import fs from "node:fs"
import { createRequire } from "node:module"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { parseArgs } from "node:util"

// moved by the Release workflow (pr-release.yml) on every release: `next` from master, `v<major>` from release/v<major>
// (a semver range, so refused by the range check as well)
const RELEASE_WORKFLOW_TAGS = /^(next|v\d+)$/
const VERSION = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/
const TAG = /^[A-Za-z][A-Za-z0-9._-]*$/

function run(file, args) {
  return execFileSync(file, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 * 1024 * 1024 })
}

// a workflow command takes one line; % \r \n escaped as the runner unescapes them
export function annotation(kind, message) {
  return `::${kind}::${message.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A")}`
}

// a strict subset of YAML: `<tag>: <version>` lines, comments and blank lines. `text` is the content of `file`;
// `semver` the semver package of npm (validRange)
export function parseConfig(text, file, semver) {
  const entries = []
  const errors = []
  const lines = text.split("\n")
  lines.forEach((raw, i) => {
    const line = raw.replace(/\r$/, "").replace(/(^|\s)#.*$/, "").trimEnd()
    if (line === "") return
    const where = `${file}:${i + 1}`
    const m = /^([^\s:]+):\s+(["']?)([^"'\s]+)\2$/.exec(line)
    if (m == null) {
      errors.push(`${where}: expected \`<dist-tag>: <electron-builder version>\`, not ${JSON.stringify(line.slice(0, 80))}`)
      return
    }
    const [, tag, , version] = m
    if (!TAG.test(tag)) {
      errors.push(`${where}: ${JSON.stringify(tag.slice(0, 80))} is not a dist-tag name such as latest`)
    } else if (RELEASE_WORKFLOW_TAGS.test(tag)) {
      errors.push(`${where}: ${tag} is moved by the Release workflow (pr-release.yml) on every release, not by this file`)
    } else if (semver.validRange(tag)) {
      errors.push(`${where}: npm does not accept ${tag} as a dist-tag: it is a semver range`)
    } else if (entries.some(e => e.tag === tag)) {
      errors.push(`${where}: ${tag} is in the file twice`)
    } else if (!VERSION.test(version)) {
      errors.push(`${where}: ${tag} must name an electron-builder version such as 26.17.0, not ${JSON.stringify(version.slice(0, 80))}`)
    } else {
      entries.push({ tag, version, where })
    }
  })
  if (errors.length === 0 && !entries.some(e => e.tag === "latest")) {
    errors.push(`${file}: has no latest (what \`npm install electron-builder\` installs)`)
  }
  return { entries, errors }
}

// electron-builder last so that it moves only once its dependencies have, the others by name
export function orderPackages(packages) {
  const isBuilder = p => p.name === "electron-builder"
  return [...packages].sort((a, b) => isBuilder(a) - isBuilder(b) || a.name.localeCompare(b.name))
}

// what moving `entry` (a dist-tag of the file) from electron-builder@`before` (its version on npm, if any) is worth a
// warning for
export function warningsOf(entry, before, semver) {
  const warnings = []
  if (entry.tag === "latest" && semver.prerelease(entry.version)) {
    warnings.push(`${entry.version} is a prerelease: it becomes what \`npm install electron-builder\` installs`)
  }
  if (before && semver.valid(before) && semver.lt(entry.version, before)) {
    warnings.push(`${entry.tag} moves back from electron-builder@${before} to ${entry.version}`)
  }
  return warnings
}

// the plan of the workflow (--plan): tag, name, version, version of the tag on npm, tab-separated
export function formatPlan(plan) {
  return plan.map(p => `${p.tag}\t${p.name}\t${p.version}\t${p.before}\n`).join("")
}

// the job summary (--summary)
export function formatMarkdown(title, entries, plan, warnings) {
  const lines = [`## ${title}`, ""]
  for (const { tag, version } of entries) {
    const rows = plan.filter(p => p.tag === tag)
    const changes = rows.filter(p => p.before !== p.version).length
    lines.push(`### \`${tag}\` → electron-builder@${version}`, "")
    lines.push(changes === 0 ? "Every package is already at this release: nothing to change." : `${changes} of ${rows.length} packages move.`, "")
    lines.push(`| Package | \`${tag}\` now | \`${tag}\` after | |`, "| --- | --- | --- | --- |")
    for (const p of rows) lines.push(`| ${p.name} | ${p.before || "-"} | ${p.version} | ${p.before === p.version ? "already set" : "moves"} |`)
    lines.push("")
  }
  if (warnings.length > 0) lines.push(...warnings.map(w => `> [!WARNING]\n> ${w}\n`))
  return lines.join("\n") + "\n"
}

// every non-private package of the release, in the order they move
function packagesOf(entry, remote, errors) {
  const ref = `refs/tags/electron-builder@${entry.version}`
  try {
    run("git", ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`])
  } catch {
    try {
      run("git", ["fetch", "--quiet", "--no-tags", "--depth=1", remote, `+${ref}:${ref}`])
    } catch {
      errors.push(`${entry.where}: there is no git tag electron-builder@${entry.version}, so no release ${entry.version}`)
      return null
    }
  }
  const files = run("git", ["ls-tree", "-r", "-z", "--name-only", ref, "--", "packages"])
    .split("\0")
    .filter(file => /^packages\/(.*\/)?package\.json$/.test(file))
  const packages = []
  for (const file of files) {
    const { name, version, private: isPrivate } = JSON.parse(run("git", ["show", `${ref}:${file}`]))
    if (!isPrivate && name && version) packages.push({ name, version })
  }
  const builder = packages.find(p => p.name === "electron-builder")
  if (builder?.version !== entry.version) {
    errors.push(`${entry.where}: packages/electron-builder/package.json at electron-builder@${entry.version} is ${builder?.version}`)
    return null
  }
  return orderPackages(packages)
}

const registry = new Map()
function npmView(name) {
  if (!registry.has(name)) {
    let data = {}
    try {
      data = JSON.parse(run("npm", ["view", name, "dist-tags", "versions", "--json"]))
    } catch (e) {
      // E404 for a package that was never published; its versions are then reported as not on npm
      if (!/E404/.test(`${e.stdout}${e.stderr}`)) throw e
    }
    registry.set(name, { distTags: data["dist-tags"] ?? {}, versions: new Set([data.versions ?? []].flat()) })
  }
  return registry.get(name)
}

function main() {
  const { values: opt } = parseArgs({
    options: {
      config: { type: "string", default: ".github/npm-dist-tags.yml" },
      plan: { type: "string" },
      summary: { type: "string" },
      title: { type: "string", default: "npm dist-tags" },
      remote: { type: "string", default: "origin" },
    },
  })

  // the semver package npm itself uses, to refuse what `npm dist-tag add` refuses
  const semver = createRequire(import.meta.url)(path.join(run("npm", ["root", "-g"]).trim(), "npm", "node_modules", "semver"))

  const { entries, errors } = parseConfig(fs.readFileSync(opt.config, "utf8"), opt.config, semver)
  const warnings = []
  const plan = []
  for (const entry of errors.length === 0 ? entries : []) {
    const packages = packagesOf(entry, opt.remote, errors)
    if (packages == null) continue
    for (const { name, version } of packages) {
      const { distTags, versions } = npmView(name)
      if (!versions.has(version)) {
        errors.push(`${entry.where}: ${name}@${version} (of electron-builder@${entry.version}) is not on npm`)
        continue
      }
      plan.push({ tag: entry.tag, name, version, before: distTags[entry.tag] ?? "" })
    }
    warnings.push(...warningsOf(entry, npmView("electron-builder").distTags[entry.tag], semver))
  }

  for (const warning of warnings) console.log(annotation("warning", warning))
  for (const error of errors) console.log(annotation("error", error))
  if (errors.length > 0) process.exit(1)

  const markdown = formatMarkdown(opt.title, entries, plan, warnings)
  console.log(markdown)
  if (opt.summary) fs.appendFileSync(opt.summary, markdown)
  if (opt.plan) fs.writeFileSync(opt.plan, formatPlan(plan))
}

if (process.argv[1] != null && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href) {
  main()
}
