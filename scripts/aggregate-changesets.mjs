#!/usr/bin/env node
// The root CHANGELOG.md section of a release and the bodies of its GitHub releases, from the changesets of that release.
// A release gets one section with a sub-section per lead package; each sub-section is that package's release body:
//
//   # [27.0.0](compare-url) (2026-10-16)
//   ## electron-builder@27.0.0      changesets of electron-builder's linked/fixed group
//   ### Major Changes ...
//   ## electron-updater@7.0.0       changesets of electron-updater and builder-util-runtime
//   ### Patch Changes ...
//
// builder-util-runtime ships in both: its changesets are listed under electron-updater, and under electron-builder as
// well when they name no other package. The release plan, the commit lookup and the changelog generator
// (config.changelog) are the ones `changeset version` uses, so every entry reads as in packages/*/CHANGELOG.md (neither
// is formatted: "prettier": false). In pre mode, a changeset an earlier prerelease released is listed again, marked as
// updated, when it was edited since the last release (changesets releases it again only when pre mode is exited).
//
//   --mode after-version   right after `changeset version` (HEAD = the pre-version commit): the release it just made
//   --mode next | exit     preview of what `changeset version` would release now (exit: after `changeset pre exit`)
//   --mode range --from <ref> --to <ref>   the release made between two git refs (rewrites a past section)
//   --insert <file>        put the section into <file> (a re-run replaces it), instead of printing it
//   --notes <pkg>@<ver>    print the GitHub release body of that tag from CHANGELOG.md (no GitHub calls)
//   --max-chars <n>        with --notes: shorten the body to at most <n> characters (default 125000, GitHub's limit)
//
// Runs in the repository root. Needs GITHUB_TOKEN (changesets-changelog-clean looks up the PR of each commit), except
// with --notes.
import { execFile, execFileSync } from "node:child_process"
import fs from "node:fs"
import { createRequire } from "node:module"
import path from "node:path"
import { parseArgs, promisify } from "node:util"

const { values: opt } = parseArgs({
  options: {
    mode: { type: "string", default: "next" },
    from: { type: "string" },
    to: { type: "string" },
    insert: { type: "string" },
    notes: { type: "string" },
    "max-chars": { type: "string" },
  },
})

const TYPES = ["major", "minor", "patch"]
const LEAD_PACKAGES = ["electron-builder", "app-builder-lib", "electron-updater"]
// a dependency of both electron-builder and electron-updater
const SHARED = new Set(["builder-util-runtime"])
const MAX_CHARS = 125000 // GitHub rejects release bodies over 125,000 characters

function fail(message) {
  console.error(`aggregate-changesets: ${message}`)
  process.exit(1)
}

if (!["next", "exit", "range", "after-version"].includes(opt.mode)) {
  fail("--mode must be next, exit, range or after-version")
}
if (opt.mode === "range" && !(opt.from && opt.to)) {
  fail("--mode range needs --from <ref> and --to <ref>")
}
if (opt["max-chars"] !== undefined && !/^[1-9]\d*$/.test(opt["max-chars"])) {
  fail(`--max-chars must be a positive integer, got "${opt["max-chars"]}"`)
}
if (opt["max-chars"] !== undefined && !opt.notes) {
  fail("--max-chars needs --notes")
}
const maxChars = opt["max-chars"] === undefined ? MAX_CHARS : Number(opt["max-chars"])

const cwd = process.cwd()
const changelogFile = path.join(cwd, "CHANGELOG.md")

// changesets' own packages are transitive dependencies of @changesets/cli, so resolve them from its real location (pnpm)
const cliRequire = createRequire(fs.realpathSync(createRequire(import.meta.url).resolve("@changesets/cli/package.json")))
const requireFrom = pkg => createRequire(fs.realpathSync(cliRequire.resolve(`${pkg}/package.json`)))
const interop = m => m.default ?? m
const getReleasePlan = interop(cliRequire("@changesets/get-release-plan"))
const assembleReleasePlan = interop(cliRequire("@changesets/assemble-release-plan"))
const readChangesets = interop(cliRequire("@changesets/read"))
const parseChangeset = interop(requireFrom("@changesets/read")("@changesets/parse"))
const { readPreState } = cliRequire("@changesets/pre")
const { read: readConfig } = cliRequire("@changesets/config")
const { getCommitsThatAddFiles, isRepoShallow } = cliRequire("@changesets/git")
const { shouldSkipPackage } = cliRequire("@changesets/should-skip-package")
const { getPackages } = cliRequire("@manypkg/get-packages")
const semver = cliRequire("semver")

function run(cmd, args) {
  return execFileSync(cmd, args, { cwd, encoding: "utf8", maxBuffer: 256 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] })
}

// `git show <ref>:./<file>`, undefined when the file does not exist at that ref
function gitShow(ref, file) {
  try {
    return run("git", ["show", `${ref}:./${file}`])
  } catch {
    return undefined
  }
}

function tagExists(tag) {
  try {
    run("git", ["rev-parse", "-q", "--verify", `refs/tags/${tag}`])
    return true
  } catch {
    return false
  }
}

const readJson = text => (text === undefined ? undefined : JSON.parse(text))
const readJsonFile = file => (fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : undefined)

function packageOrder(a, b) {
  const ia = LEAD_PACKAGES.indexOf(a)
  const ib = LEAD_PACKAGES.indexOf(b)
  if (ia !== -1 || ib !== -1) {
    return (ia === -1 ? Infinity : ia) - (ib === -1 ? Infinity : ib)
  }
  return a < b ? -1 : a > b ? 1 : 0
}

const bumpRank = type => TYPES.length - TYPES.indexOf(type) // major 3, minor 2, patch 1

// ---------------------------------------------------------------------------------------------------------------------
// Release data: { changesets: [{ id, summary, releases, commit, updatedBy? }], packages: [{ name, oldVersion,
// newVersion }], preState, exiting } where exiting = this release leaves pre mode (its changesets span every
// prerelease since initialVersions) and updatedBy = the commit that edited an already released changeset

// changeset ids (file names without .md) in .changeset/ at a git ref (-z: git quotes non-ASCII file names otherwise)
function changesetIdsAt(ref) {
  return run("git", ["ls-tree", "-z", "--name-only", ref, "--", ".changeset/"])
    .split("\0")
    .map(f => path.posix.basename(f))
    .filter(f => f.endsWith(".md") && !/^README\.md$/i.test(f))
    .map(f => f.slice(0, -3))
}

// a changeset at a git ref, or in the working tree (ref undefined), as `changeset version` reads it
function changesetAt(ref, id) {
  const file = `.changeset/${id}.md`
  const content = ref === undefined ? (fs.existsSync(path.join(cwd, file)) ? fs.readFileSync(path.join(cwd, file), "utf8") : undefined) : gitShow(ref, file)
  return content === undefined ? undefined : { ...parseChangeset(content), id }
}

let historyChecked = false

// the changesets with the commit that added each one (@changesets/git's lookup, from an explicit ref and with `--`,
// because the files may already be deleted from the working tree)
async function readAt(ref, ids, worktree = false) {
  if (ids.length && !historyChecked) {
    if (await isRepoShallow({ cwd })) {
      fail("shallow clone: fetch the full history (fetch-depth: 0) so changeset commits resolve")
    }
    historyChecked = true
  }
  const gitLog = promisify(execFile)
  const commits = await Promise.all(
    ids.map(async id => (await gitLog("git", ["log", ref, "--diff-filter=A", "--max-count=1", "--format=%H", "--", `.changeset/${id}.md`], { cwd })).stdout.trim() || undefined)
  )
  return ids.map((id, i) => {
    const changeset = changesetAt(worktree ? undefined : ref, id)
    if (!changeset) {
      fail(`.changeset/${id}.md does not exist ${worktree ? "in the working tree" : `at ${ref}`}`)
    }
    return { ...changeset, commit: commits[i] }
  })
}

// Changesets that an earlier prerelease released (ids) and whose text or releases changed between the last release
// (ref) and now (a git ref, or undefined for the working tree), with the last commit that changed each one
async function updatedSince(ref, ids, now) {
  if (!ref) {
    return [] // pre mode was entered but not committed yet
  }
  // only a changeset whose file differs between the two states can have changed
  const changed = new Set(
    run("git", ["diff", "-z", "--name-only", ref, ...(now ? [now] : []), "--", ".changeset/"])
      .split("\0")
      .map(f => path.posix.basename(f, ".md"))
  )
  const comparable = cs => cs && JSON.stringify([cs.summary.trim(), [...cs.releases].sort((a, b) => (a.name < b.name ? -1 : 1))])
  const updated = ids.filter(id => {
    if (!changed.has(id)) {
      return false
    }
    const before = changesetAt(ref, id)
    const after = changesetAt(now, id)
    return before && after && comparable(before) !== comparable(after)
  })
  return (await readAt(now ?? "HEAD", updated, now === undefined)).map(cs => {
    const [sha, subject] = run("git", ["log", "-1", "--format=%H%x00%s", `${ref}..${now ?? "HEAD"}`, "--", `.changeset/${cs.id}.md`])
      .trim()
      .split("\0")
    // an edit that is not committed yet has no commit
    return { ...cs, updatedBy: sha ? { sha, subject } : {} }
  })
}

// the last release in pre mode: the commit that last changed pre.json
const lastPreRelease = () => run("git", ["log", "-1", "--format=%H", "HEAD", "--", ".changeset/pre.json"]).trim()

async function fromReleasePlan(workspace, config, exit) {
  const preState = await readPreState(cwd)
  const plan = exit ? assembleReleasePlan(await readChangesets(cwd), workspace, config, preState && { ...preState, mode: "exit" }) : await getReleasePlan(cwd)
  // the commit that added each changeset, looked up like @changesets/apply-release-plan does (without its fallback to
  // v1 `.changeset/<id>/changes.json` files, which this repo never had)
  const commits = await getCommitsThatAddFiles(
    plan.changesets.map(cs => `.changeset/${cs.id}.md`),
    { cwd }
  )
  const updated = !exit && preState?.mode === "pre" ? await updatedSince(lastPreRelease(), preState.changesets, undefined) : []
  return {
    changesets: [...plan.changesets.map((cs, i) => ({ ...cs, commit: commits[i] })), ...updated],
    packages: plan.releases.filter(r => r.type !== "none").map(r => ({ name: r.name, oldVersion: r.oldVersion, newVersion: r.newVersion })),
    preState: plan.preState,
    exiting: plan.preState?.mode === "exit",
  }
}

function changedPackages(workspace, fromRef, toRef) {
  const packages = []
  for (const pkg of workspace.packages) {
    const file = path.relative(cwd, path.join(pkg.dir, "package.json")).split(path.sep).join("/")
    const before = readJson(gitShow(fromRef, file))?.version
    const after = (toRef === undefined ? readJsonFile(path.join(pkg.dir, "package.json")) : readJson(gitShow(toRef, file)))?.version
    if (before && after && before !== after) {
      packages.push({ name: pkg.packageJson.name, oldVersion: before, newVersion: after })
    }
  }
  return packages
}

// HEAD = the commit `changeset version` started from, the working tree = what it wrote
async function fromAfterVersion(workspace) {
  const headPre = readJson(gitShow("HEAD", ".changeset/pre.json"))
  const treePre = readJsonFile(path.join(cwd, ".changeset/pre.json"))
  let changesets
  if (treePre?.mode === "pre") {
    // pre mode keeps the changeset files: the ids added to pre.json, read from the working tree as `changeset version` did
    const released = new Set(headPre?.changesets ?? [])
    changesets = await readAt(
      "HEAD",
      treePre.changesets.filter(id => !released.has(id)),
      true
    )
    changesets.push(...(await updatedSince(lastPreRelease(), headPre?.changesets ?? [], undefined)))
  } else {
    // normal mode, or `changeset pre exit` + `changeset version`: the files it deleted (only committed ones can be found)
    changesets = await readAt(
      "HEAD",
      changesetIdsAt("HEAD").filter(id => !fs.existsSync(path.join(cwd, ".changeset", `${id}.md`)))
    )
  }
  // pre.json is deleted by the `changeset version` that leaves pre mode
  return { changesets, packages: changedPackages(workspace, "HEAD", undefined), preState: headPre, exiting: headPre !== undefined && treePre === undefined }
}

async function fromRange(workspace) {
  const { from, to } = opt
  const fromPre = readJson(gitShow(from, ".changeset/pre.json"))
  const toPre = readJson(gitShow(to, ".changeset/pre.json"))
  let changesets
  if (toPre?.mode === "pre") {
    // the changesets as `changeset version` read them: at the parent of the version commit, like --mode after-version
    const released = new Set(fromPre?.changesets ?? [])
    changesets = await readAt(
      `${to}^`,
      toPre.changesets.filter(id => !released.has(id))
    )
    changesets.push(...(await updatedSince(from, fromPre?.changesets ?? [], `${to}^`)))
  } else {
    // normal release (or the release that left pre mode): the changeset files deleted between the two refs by a
    // `changeset version` commit (it writes the package changelogs in the same commit; a changeset deleted by hand, e.g.
    // replaced by another one, was never released), each read at the parent of that commit
    const added = run("git", ["log", "-z", "--diff-filter=A", "--name-only", "--format=", `${from}..${to}`, "--", ".changeset/"])
      .split("\0")
      .filter(f => /^\.changeset\/[^/]+\.md$/.test(f) && !/README\.md$/i.test(f))
      .map(f => path.posix.basename(f, ".md"))
    const remaining = new Set(changesetIdsAt(to))
    changesets = []
    for (const id of [...new Set([...changesetIdsAt(from), ...added])].filter(id => !remaining.has(id))) {
      const deletedBy = run("git", ["log", "--diff-filter=D", "--max-count=1", "--format=%H", `${from}..${to}`, "--", `.changeset/${id}.md`]).trim()
      if (deletedBy && run("git", ["show", "--name-only", "--format=", deletedBy, "--", "*CHANGELOG.md"]).trim()) {
        changesets.push(...(await readAt(`${deletedBy}^`, [id])))
      }
    }
  }
  return { changesets, packages: changedPackages(workspace, from, to), preState: fromPre, exiting: toPre?.mode !== "pre" && fromPre !== undefined }
}

// ---------------------------------------------------------------------------------------------------------------------
// Markdown

// the git tag of a release: <name>@<version>, or v<version> for electron-builder before 26.1.0
const tagOf = (name, version) => [`${name}@${version}`, ...(name === "electron-builder" ? [`v${version}`] : [])].find(tagExists)

function heading(repo, lead, date) {
  const label = lead.name === "electron-builder" ? lead.newVersion : `${lead.name}@${lead.newVersion}`
  // only packages that `changeset tag` tags (electron-builder, electron-updater) get a compare link
  const prevTag = lead.prevVersion && tagOf(lead.name, lead.prevVersion)
  const link = prevTag ? `[${label}](https://github.com/${repo}/compare/${prevTag}...${tagOf(lead.name, lead.newVersion) ?? `${lead.name}@${lead.newVersion}`})` : label
  // always "#", also for patch versions (conventional-changelog used "##" for those): "##" is a package sub-section
  return `# ${link} (${date})`
}

// changesets-changelog-clean returns the bare summary for a changeset without a commit (not committed yet)
function asListItem(summary) {
  const [first, ...rest] = summary.split("\n")
  const body = rest.join("\n").trim()
  return body ? `- ${first}\n\n${body
    .split("\n")
    .map(l => (l ? `  ${l}` : l))
    .join("\n")}` : `- ${first}`
}

const changesHeading = type => `### ${type[0].toUpperCase()}${type.slice(1)} Changes`

// "## <lead>@<version>" per section, then its entries by bump type, each annotated on its first line; a section
// without changesets (its lead was released only because a dependency was) names the released dependencies instead
function renderSection(head, sections) {
  const parts = [head]
  for (const s of sections) {
    parts.push(`## ${s.lead.name}@${s.lead.newVersion}`)
    if (!s.entries.length) {
      parts.push(`Updated dependencies: ${s.dependencies.map(p => `\`${p.name}@${p.newVersion}\``).join(", ")}`)
    }
    for (const type of TYPES) {
      const entries = s.entries.filter(e => e.type === type)
      if (entries.length) {
        parts.push(`${changesHeading(type)}\n\n${entries.map(e => (e.note ? e.line.replace(/^.*/, first => `${first} — ${e.note}`) : e.line)).join("\n")}`)
      }
    }
  }
  return `${parts.join("\n\n")}\n`
}

// ---------------------------------------------------------------------------------------------------------------------
// Root CHANGELOG.md

// Release headings: every "#" heading with a version label ("# [27.0.0](compare-url) (2026-10-16)",
// "# [electron-updater@7.0.1](compare-url) (...)", "# electron-forge-maker-snap@27.0.1 (...)"), and the "##" headings
// conventional-changelog wrote for patch releases ("## [26.0.1](compare-url) (...)", "## 26.9.1 (2026-05-07)": a bare
// version and a date). The "## <pkg>@<version>" package sub-sections are not release headings.
const RELEASE_HEADING = /^(#{1,2}) (?:\[([^\]]+)\]\([^)]*\)|(\S+))( \(\d{4}-\d{2}-\d{2}\))?\s*$/
const SUB_HEADING = /^## (\S+@\S+)$/

function releaseHeadings(lines) {
  const found = []
  lines.forEach((line, index) => {
    const m = RELEASE_HEADING.exec(line)
    const label = m && (m[2] ?? m[3])
    if (label && semver.valid(label.replace(/^.+@/, "")) && (m[1] === "#" || (m[4] && !label.includes("@")))) {
      found.push({ index, label })
    }
  })
  return found
}

// the date of the <label> release heading in a changelog
function headingDate(text, label) {
  const lines = (text ?? "").split("\n")
  const found = releaseHeadings(lines).find(h => h.label === label)
  return found && /\((\d{4}-\d{2}-\d{2})\)\s*$/.exec(lines[found.index])?.[1]
}

// the package and version of a release label: a bare version is electron-builder's
function parseLabel(label) {
  const at = label.lastIndexOf("@")
  return at > 0 ? { name: label.slice(0, at), version: label.slice(at + 1) } : { name: "electron-builder", version: label }
}

// the version of <name> that the section of release heading i releases: the heading's own, else the one of its
// "## <name>@<version>" sub-section (electron-updater in a release led by electron-builder)
function releasedVersion(lines, headings, i, name) {
  const own = parseLabel(headings[i].label)
  if (own.name === name) {
    return own.version
  }
  const end = headings[i + 1]?.index ?? lines.length
  for (let j = headings[i].index + 1; j < end; j++) {
    const sub = SUB_HEADING.exec(lines[j])?.[1]
    if (sub && parseLabel(sub).name === name && semver.valid(parseLabel(sub).version)) {
      return parseLabel(sub).version
    }
  }
  return undefined
}

// a new release goes to the top and a re-run replaces the section of its release; a past release (--mode range) that
// is not in the file goes above the first release with an older version of its lead package (electron-builder, or
// e.g. electron-updater released alone: then also a release that has an older electron-updater sub-section), or below
// the last release of that package when all are newer
function insertSection(file, section, label) {
  const original = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : ""
  if (!original.trim()) {
    fs.writeFileSync(file, `${section.trimEnd()}\n`)
    return "wrote"
  }
  const eol = original.includes("\r\n") ? "\r\n" : "\n"
  const lines = original.replace(/\r\n/g, "\n").split("\n")
  const headings = releaseHeadings(lines)
  const existing = headings.findIndex(h => h.label === label)
  const { name, version } = parseLabel(label)
  const same = headings.map((h, i) => ({ i, version: releasedVersion(lines, headings, i, name) })).filter(h => h.version)
  let older = headings[0]
  if (same.some(h => semver.gt(h.version, version))) {
    const next = same.find(h => semver.lt(h.version, version))
    older = headings[next ? next.i : same[same.length - 1].i + 1]
  }
  const at = existing === -1 ? (older?.index ?? lines.length) : headings[existing].index
  const end = existing === -1 ? at : (headings[existing + 1]?.index ?? lines.length)
  // conventional-changelog separates releases with three blank lines
  lines.splice(at, end - at, ...section.trimEnd().split("\n"), ...(end < lines.length ? ["", "", ""] : [""]))
  fs.writeFileSync(file, lines.join("\n").replace(/\n/g, eol))
  return existing === -1 ? "inserted" : "replaced"
}

// The release body of tag <pkg>@<version> (a bare <version> or v<version> means electron-builder@<version>): its
// "## <pkg>@<version>" sub-section without the heading, plus the release heading's compare link when that link is for
// this tag (normally electron-builder's; electron-updater's in a release of electron-updater alone). A release written
// before the sub-sections (conventional-changelog) has no sub-sections: its whole section is the electron-builder body.
function extractNotes(file, spec) {
  const tag = spec.lastIndexOf("@") > 0 ? spec : `electron-builder@${spec.replace(/^v/, "")}`
  const version = tag.slice(tag.lastIndexOf("@") + 1)
  const forTag = link => link?.endsWith(`...${tag}`) || (tag === `electron-builder@${version}` && link?.endsWith(`...v${version}`))
  const lines = fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n").split("\n")
  const headings = releaseHeadings(lines)
  for (const [i, { index, label }] of headings.entries()) {
    const end = headings[i + 1]?.index ?? lines.length
    const subs = []
    for (let j = index + 1; j < end; j++) {
      if (SUB_HEADING.test(lines[j])) {
        subs.push(j)
      }
    }
    const compare = /\]\((https:\/\/github\.com\/[^)]+\/compare\/[^)]+)\)/.exec(lines[index])?.[1]
    const sub = subs.findIndex(j => lines[j] === `## ${tag}`)
    if (sub !== -1) {
      return { tag, body: lines.slice(subs[sub] + 1, subs[sub + 1] ?? end), compare: forTag(compare) ? compare : undefined }
    }
    if (!subs.length && (label === tag || `electron-builder@${label}` === tag)) {
      return { tag, body: lines.slice(index + 1, end), compare }
    }
  }
  fail(`no "${tag}" section in ${file}`)
}

// GitHub release body: the section without its heading (the release title shows it) plus the compare link.
// Over the limit it is shortened step by step:
//   1. links: `[`#123`](…/pull/123) [`abc1234`](…/commit/…)` -> `#123` (GitHub autolinks it), nothing else lost
//   2-4. patch, then minor, then major entries reduced to their first line
//   5. entries dropped from the end of the patch, minor, major groups
function releaseNotes({ tag, body, compare }, limit, repo) {
  const footer = compare ? `\n\n**Full Changelog**: ${compare}\n` : "\n"
  const full = body.join("\n").trim() + footer
  if (full.length <= limit) {
    return { notes: full, level: "full" }
  }

  const notice = what => `> Shortened to fit GitHub's release size limit (${what}). The complete notes are in [CHANGELOG.md](https://github.com/${repo}/blob/${tag}/CHANGELOG.md).\n\n`
  const escaped = repo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const links = new RegExp(String.raw`\[\x60#(\d+)\x60\]\(https://github\.com/${escaped}/pull/\d+\)(?: \[\x60[0-9a-f]{7}\x60\]\([^)\s]+\))?`, "g")

  // groups -> items (first line + continuation lines)
  const blocks = []
  for (const line of body.join("\n").replace(links, "#$1").split("\n")) {
    if (line.startsWith("### ") || !blocks.length) {
      blocks.push({ heading: line.startsWith("### ") ? line : undefined, intro: [], items: [] })
      if (line.startsWith("### ")) {
        continue
      }
    }
    const block = blocks[blocks.length - 1]
    if (/^[-*] /.test(line)) {
      block.items.push([line])
    } else if (block.items.length) {
      block.items[block.items.length - 1].push(line)
    } else {
      block.intro.push(line)
    }
  }
  const typeOf = block => /(Major|Minor|Patch) Changes$/.exec(block.heading ?? "")?.[1]?.toLowerCase()
  const render = (shorten, dropped = new Map()) =>
    blocks
      .map(block => {
        const type = typeOf(block)
        let items = block.items.map(item => (shorten.includes(type) ? [item[0]] : item).join("\n").trimEnd())
        const cut = dropped.get(block) ?? 0
        if (cut) {
          items = [...items.slice(0, items.length - cut), `- …and ${cut} more ${type} changes, see the complete notes`]
        }
        // a blank line only after an item with more than one paragraph
        const list = items.map((item, i) => item + (i === items.length - 1 ? "" : item.includes("\n") ? "\n\n" : "\n")).join("")
        return [block.heading, block.intro.join("\n").trim(), list].filter(Boolean).join("\n\n")
      })
      .filter(Boolean)
      .join("\n\n")

  const steps = [
    [[], "links shortened to #PR references"],
    [["patch"], "links shortened, patch entries reduced to their first line"],
    [["patch", "minor"], "links shortened, patch and minor entries reduced to their first line"],
    [["patch", "minor", "major"], "links shortened, every entry reduced to its first line"],
  ]
  for (const [shorten, what] of steps) {
    const notes = notice(what) + render(shorten) + footer
    if (notes.length <= limit) {
      return { notes, level: what }
    }
  }
  const dropped = new Map()
  for (const block of ["patch", "minor", "major"].flatMap(type => blocks.filter(b => typeOf(b) === type))) {
    for (let n = 1; n <= block.items.length; n++) {
      dropped.set(block, n)
      const notes = notice("every entry reduced to its first line, the last entries left out") + render(["patch", "minor", "major"], dropped) + footer
      if (notes.length <= limit) {
        return { notes, level: `first lines, ${[...dropped.values()].reduce((a, b) => a + b, 0)} entries left out` }
      }
    }
  }
  fail("release notes do not fit even without entries")
}

// ---------------------------------------------------------------------------------------------------------------------

async function main() {
  const workspace = await getPackages(cwd)
  const config = await readConfig(cwd, workspace)
  if (!config.changelog) {
    fail("changelog generation is disabled in .changeset/config.json")
  }
  // the entries are the changelog generator's text as is, like the package changelogs that `changeset version` writes
  if (config.prettier !== false) {
    fail('.changeset/config.json must set "prettier": false (the changelogs are not formatted)')
  }
  const [changelogModule, changelogOptions] = config.changelog
  const repo = changelogOptions?.repo
  if (!repo) {
    fail("config.changelog has no repo option")
  }

  if (opt.notes) {
    const { notes, level } = releaseNotes(extractNotes(changelogFile, opt.notes), maxChars, repo)
    process.stdout.write(notes)
    console.error(`aggregate-changesets: release notes for ${opt.notes}: ${notes.length} characters (${level})`)
    return
  }

  const byName = new Map(workspace.packages.map(p => [p.packageJson.name, p]))
  // a private package is never published: one versioned on its own (docker) has only its own CHANGELOG.md
  const skipped = name => !byName.has(name) || byName.get(name).packageJson.private === true || shouldSkipPackage(byName.get(name), { ignore: config.ignore, allowPrivatePackages: config.privatePackages.version })
  const data =
    opt.mode === "range"
      ? await fromRange(workspace)
      : opt.mode === "after-version"
        ? await fromAfterVersion(workspace)
        : await fromReleasePlan(workspace, config, opt.mode === "exit")

  const packages = data.packages.filter(p => !skipped(p.name)).sort((a, b) => packageOrder(a.name, b.name))
  if (!packages.length) {
    console.error(`aggregate-changesets: no released packages found (mode ${opt.mode}), nothing written`)
    return
  }

  // one section per lead package: electron-builder's linked (or fixed) group, then electron-updater; a section is led
  // by its first released package (electron-builder, else e.g. a forge maker released on its own)
  const builderGroup = new Set([...config.fixed, ...config.linked].find(group => group.includes("electron-builder")) ?? [])
  if (!builderGroup.size) {
    fail("electron-builder is in no linked or fixed group of .changeset/config.json")
  }
  const isUpdater = r => r.name === "electron-updater"
  const sections = [
    // the builder packages, and builder-util-runtime alone; under the highest bump of its builder and
    // builder-util-runtime packages
    {
      packages: builderGroup,
      includes: P => P.some(r => builderGroup.has(r.name)) || P.every(r => SHARED.has(r.name)),
      bumps: P => P.filter(r => builderGroup.has(r.name) || SHARED.has(r.name)),
    },
    // electron-updater and builder-util-runtime; under the bump of electron-updater, as in
    // packages/electron-updater/CHANGELOG.md, else of builder-util-runtime
    {
      packages: new Set(["electron-updater"]),
      includes: P => P.some(r => isUpdater(r) || SHARED.has(r.name)),
      bumps: P => (P.some(isUpdater) ? P.filter(isUpdater) : P.filter(r => SHARED.has(r.name))),
    },
  ]
    .map(s => ({ ...s, lead: packages.find(p => s.packages.has(p.name)) }))
    .filter(s => s.lead)

  // a changeset's releases without ignored or private packages and "none" (P) decide the sections it is listed in
  const changesets = data.changesets
    .map(cs => ({
      changeset: { id: cs.id, summary: cs.summary, releases: cs.releases, commit: cs.commit },
      updatedBy: cs.updatedBy,
      shown: cs.releases.filter(r => r.type !== "none" && !skipped(r.name)).sort((a, b) => packageOrder(a.name, b.name)),
    }))
    .filter(cs => cs.shown.length)
  for (const cs of changesets) {
    cs.sections = sections.filter(s => s.includes(cs.shown))
    if (cs.sections.length) {
      continue
    }
    const what = `.changeset/${cs.changeset.id}.md (${cs.shown.map(r => r.name).join(", ")})`
    // an edited changeset whose packages are not released this time is left out (its text is released when pre mode is
    // exited)
    if (cs.updatedBy) {
      console.error(`aggregate-changesets: ${what} was updated, but none of its packages is released now; left out`)
    } else {
      fail(`${what} belongs to no released section`)
    }
  }

  // the changelog generator, resolved like @changesets/apply-release-plan does (from .changeset/ first)
  let changelogPath
  try {
    changelogPath = createRequire(path.join(cwd, ".changeset", "config.json")).resolve(changelogModule)
  } catch {
    changelogPath = cliRequire.resolve(changelogModule)
  }
  const changelogFunctions = interop(createRequire(import.meta.url)(changelogPath))

  // chronological (the commit that added each changeset, or that edited an updated one), the order of the release
  const sortCommit = cs => cs.updatedBy?.sha ?? cs.changeset.commit
  const known = changesets.map(sortCommit).filter(Boolean)
  const time = new Map(
    known.length
      ? run("git", ["log", "--no-walk=unsorted", "--format=%H %ct", ...new Set(known)])
          .trim()
          .split("\n")
          .map(l => [l.split(" ")[0], Number(l.split(" ")[1])])
      : []
  )
  const when = cs => time.get(sortCommit(cs)) ?? Infinity
  changesets.sort((a, b) => when(a) - when(b) || (a.changeset.id < b.changeset.id ? -1 : a.changeset.id > b.changeset.id ? 1 : 0))

  // "updated in #123" (the PR of a squash-merged commit), else the commit
  const updatedNote = ({ sha, subject }) => {
    const pr = sha && /\(#(\d+)\)$/.exec(subject)?.[1]
    if (pr) {
      return `updated in [\`#${pr}\`](https://github.com/${repo}/pull/${pr})`
    }
    return sha ? `updated in [\`${sha.slice(0, 7)}\`](https://github.com/${repo}/commit/${sha})` : "updated"
  }

  // one entry per changeset and section, annotated with its packages of that section and builder-util-runtime (not
  // when that is just the lead package)
  const entries = changesets.flatMap(cs =>
    cs.sections.map(s => {
      const names = cs.shown.filter(r => s.packages.has(r.name) || SHARED.has(r.name)).map(r => r.name)
      return {
        cs,
        section: s,
        type: s.bumps(cs.shown).reduce((best, r) => (bumpRank(r.type) > bumpRank(best) ? r.type : best), "patch"),
        note: [names.length === 1 && names[0] === s.lead.name ? "" : names.map(n => `\`${n}\``).join(", "), cs.updatedBy && updatedNote(cs.updatedBy)].filter(Boolean).join(" · "),
      }
    })
  )
  // all getReleaseLine calls in the same tick: @changesets/get-github-info batches them into one GraphQL request
  let lines
  try {
    lines = await Promise.all(entries.map(e => changelogFunctions.getReleaseLine(e.cs.changeset, e.type, changelogOptions)))
  } catch (e) {
    fail(`${changelogModule} failed: ${e?.message ?? e}${process.env.GITHUB_TOKEN ? "" : "\nGITHUB_TOKEN is not set"}`)
  }
  // changesets drops an empty release line (an uncommitted changeset with an empty summary) from the changelog
  entries.forEach((e, i) => (e.line = lines[i] && (e.cs.changeset.commit ? lines[i] : asListItem(lines[i]))))
  for (const s of sections) {
    s.entries = entries.filter(e => e.section === s && e.line)
    const dependencies = byName.get(s.lead.name).packageJson.dependencies ?? {}
    s.dependencies = packages.filter(p => Object.hasOwn(dependencies, p.name))
    if (!s.entries.length && !s.dependencies.length) {
      fail(`${s.lead.name}@${s.lead.newVersion} is released without changesets or released dependencies`)
    }
  }

  const leadRelease = packages[0]
  const lead = {
    ...leadRelease,
    prevVersion: data.exiting && data.preState?.initialVersions?.[leadRelease.name] ? data.preState.initialVersions[leadRelease.name] : leadRelease.oldVersion,
  }
  const label = lead.name === "electron-builder" ? lead.newVersion : `${lead.name}@${lead.newVersion}`
  // conventional-changelog dates in UTC (the day the changelog was generated); a past release keeps the date it has in
  // the changelog, else gets the date of its commit
  const date =
    opt.mode === "range"
      ? (headingDate(opt.insert && fs.existsSync(opt.insert) ? fs.readFileSync(opt.insert, "utf8") : undefined, label) ??
        headingDate(gitShow(opt.to, "CHANGELOG.md"), label) ??
        new Date(run("git", ["log", "-1", "--format=%cI", opt.to]).trim()).toISOString().slice(0, 10))
      : new Date().toISOString().slice(0, 10)
  const section = renderSection(heading(repo, lead, date), sections)

  if (opt.insert) {
    console.error(`aggregate-changesets: ${insertSection(path.resolve(opt.insert), section, label)} the ${label} section in ${opt.insert}`)
  } else {
    process.stdout.write(section)
  }
  const counts = s => `${s.lead.name}@${s.lead.newVersion} ${s.entries.length} (${TYPES.map(t => `${s.entries.filter(e => e.type === t).length} ${t}`).join(", ")})`
  console.error(
    `aggregate-changesets: ${opt.mode}: ${changesets.length} changesets (${changesets.filter(cs => cs.updatedBy).length} updated): ${sections.map(counts).join(", ")}, ` +
      `${changesets.filter(cs => entries.filter(e => e.cs === cs && e.line).length > 1).length} in both; ${packages.length} packages, ${section.length} characters`
  )
}

await main()
