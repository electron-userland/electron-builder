import { readFileSync } from "node:fs"
import { join } from "node:path"
import type { LoadContext, Plugin } from "@docusaurus/types"
import { Marked } from "marked"
import type { Base, Bump, ChangelogData, Entry, Release, Section } from "../src/changelog/model"

// The /changelog page (src/components/Changelog): the releases of the root CHANGELOG.md in the format
// scripts/aggregate-changesets.mjs writes, from the newest down to the first conventional-changelog release (the
// history before v24, which the page links on GitHub instead). The format is parsed strictly: a line that doesn't fit
// fails the build instead of dropping a release or an entry from the page.

// "# [27.0.0](<repo>/compare/electron-builder@26.15.3...electron-builder@27.0.0) (2026-10-16)",
// "# [electron-updater@7.0.1](…) (…)", or a package released alone without a previous tag: "# <pkg>@<version> (…)"
const RELEASE =
  /^# (?:\[(?<label>[^\]\s]+)\]\((?<repo>https:\/\/github\.com\/[^/\s]+\/[^/\s]+)\/compare\/(?<from>[^)\s]+?)\.\.\.(?<to>[^)\s]+)\)|(?<bare>[^\s[]+)) \((?<date>\d{4}-\d{2}-\d{2})\)$/
const SECTION = /^## (?<pkg>[^\s@]\S*)@(?<version>[^@\s]+)$/
const GROUP = /^### (Major|Minor|Patch) Changes$/
// matched from the end of the line: a summary can contain " — " itself
const ENTRY = /^- (?<summary>.*) _(?:\[`#(?<pr>\d+)`\]\([^)\s]+\) )?\[`[0-9a-f]{7}`\]\([^)\s]+\/commit\/(?<commit>[0-9a-f]{40})\)_(?: — (?<note>.+))?$/
const NOTE = /^(?:(?<packages>`[^`\s]+`(?:, `[^`\s]+`)*)(?: · (?<updated>.+))?|(?<updatedOnly>updated.*))$/
const UPDATED = /^updated(?: in \[`(?:#(?<pr>\d+)|(?<commit>[0-9a-f]{7}))`\]\([^)\s]+\))?$/
const DEPENDENCIES = /^Updated dependencies: (?<list>`[^`]+`(?:, `[^`]+`)*)$/
const VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/

// also conventional-changelog's "##" patch release headings ("## [25.1.6](…) (…)", where the parsed history ends), not "## <pkg>@<version>"
const isReleaseHeading = (line: string) => line.startsWith("# ") || /^## .* \(\d{4}-\d{2}-\d{2}\)$/.test(line)

// a heading label or compare-link ref: a bare version and "v<version>" (the tags before 26.1.0) are electron-builder's
function parseRef(ref: string): { pkg: string; version: string } {
  const at = ref.lastIndexOf("@")
  return at > 0 ? { pkg: ref.slice(0, at), version: ref.slice(at + 1) } : { pkg: "electron-builder", version: ref.replace(/^v(?=\d)/, "") }
}

const codeSpans = (list: string) => list.split(", ").map(item => item.slice(1, -1))

const major = (version: string) => Number(version.split(".")[0])

export function parseChangelog(text: string): ChangelogData {
  const lines = text.split("\n")
  const releases: Release[] = []
  const headingLines = new Map<Release, number>()
  let repo: string | undefined
  let section: Section | undefined
  let bump: Bump | undefined
  let entry: Entry | undefined
  let body: string[] | undefined

  const fail = (index: number, message: string): never => {
    throw new Error(`CHANGELOG.md:${index + 1}: ${message}`)
  }
  const closeEntry = () => {
    if (entry !== undefined && body !== undefined) {
      while (body.length > 0 && body[0] === "") {
        body.shift()
      }
      while (body.length > 0 && body[body.length - 1] === "") {
        body.pop()
      }
      if (body.length > 0) {
        entry.body = body.join("\n")
      }
    }
    entry = undefined
    body = undefined
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    // the lines after an entry's first line are indented by two spaces
    if (body !== undefined && (line === "" || line.startsWith("  "))) {
      body.push(line.slice(2))
      continue
    }
    closeEntry()
    if (line === "") {
      continue
    }

    if (isReleaseHeading(line)) {
      // a release without "## <pkg>@<version>" sections is conventional-changelog's: the parsed history ends there
      let sections = false
      for (let j = i + 1; j < lines.length && !isReleaseHeading(lines[j]); j++) {
        if (lines[j].startsWith("## ")) {
          sections = true
          break
        }
      }
      if (!sections) {
        break
      }
      const heading = RELEASE.exec(line)?.groups ?? fail(i, "unrecognized release heading")
      const own = parseRef(heading.label ?? heading.bare)
      if (!VERSION.test(own.version)) {
        fail(i, `"${own.version}" is not a version`)
      }
      if (heading.to !== undefined) {
        const to = parseRef(heading.to)
        if (to.pkg !== own.pkg || to.version !== own.version) {
          fail(i, `the compare link ends at ${heading.to}, not at the release`)
        }
        repo ??= heading.repo
      } else if (own.pkg === "electron-builder") {
        fail(i, "an electron-builder release without a compare link")
      }
      const release: Release = {
        id: own.pkg === "electron-builder" ? own.version : `${own.pkg}@${own.version}`,
        pkg: own.pkg,
        version: own.version,
        date: heading.date,
        from: heading.from,
        tag: heading.to,
        sections: [],
      }
      releases.push(release)
      headingLines.set(release, i)
      section = undefined
      bump = undefined
      continue
    }

    let match: RegExpExecArray | null
    if (releases.length > 0 && (match = SECTION.exec(line)) !== null) {
      section = { pkg: match.groups!.pkg, version: match.groups!.version, entries: [] }
      releases[releases.length - 1].sections.push(section)
      bump = undefined
      continue
    }
    if (section !== undefined && (match = GROUP.exec(line)) !== null) {
      bump = match[1].toLowerCase() as Bump
      continue
    }
    if (section !== undefined && bump !== undefined && (match = ENTRY.exec(line)) !== null) {
      const { summary, pr, commit, note } = match.groups!
      entry = { key: -1, bump, summary, commit }
      if (pr !== undefined) {
        entry.pr = Number(pr)
      }
      if (note !== undefined) {
        // the packages the changeset bumps, then whether it was updated; the page shows only the latter
        const parts = NOTE.exec(note)?.groups ?? fail(i, `unrecognized note "${note}"`)
        const updated = parts.updated ?? parts.updatedOnly
        if (updated !== undefined) {
          const ref = UPDATED.exec(updated)?.groups ?? fail(i, `unrecognized note "${note}"`)
          entry.updated = {}
          if (ref.pr !== undefined) {
            entry.updated.pr = Number(ref.pr)
          }
          if (ref.commit !== undefined) {
            entry.updated.commit = ref.commit
          }
        }
      }
      section.entries.push(entry)
      body = []
      continue
    }
    // a section without changesets: its package was released only because a dependency was
    if (section !== undefined && bump === undefined && (match = DEPENDENCIES.exec(line)) !== null) {
      section.dependencies = codeSpans(match.groups!.list)
      continue
    }
    fail(i, "unrecognized line")
  }
  closeEntry()

  const builder = releases.filter(release => release.pkg === "electron-builder")
  if (builder.length === 0) {
    throw new Error("CHANGELOG.md: no electron-builder release in the format of scripts/aggregate-changesets.mjs")
  }

  // the release each one follows: the one its compare link starts at
  const oldestMajor = major(builder[builder.length - 1].version)
  const bases = new Map<string, Base>()
  const missing = (release: Release): never =>
    fail(
      headingLines.get(release)!,
      `${release.id} compares from ${release.from}, which has no section in CHANGELOG.md (backfill it with scripts/aggregate-changesets.mjs --mode range)`
    )
  releases.forEach((release, i) => {
    if (release.from === undefined) {
      // a package released alone without a previous tag follows the release below it
      release.parent = releases[i + 1]?.id
      return
    }
    const from = parseRef(release.from)
    if (release.pkg !== "electron-builder") {
      release.parent = releases.find(other => other.sections.some(s => s.pkg === from.pkg && s.version === from.version))?.id ?? missing(release)
      return
    }
    if (from.pkg !== "electron-builder") {
      fail(headingLines.get(release)!, `the compare link starts at ${release.from}, not at an electron-builder release`)
    }
    release.parent = from.version
    if (!builder.some(other => other.version === from.version)) {
      // only a version of an older major than all that are read is a base, a missing one of a major that is read is a gap
      if (major(from.version) >= oldestMajor) {
        missing(release)
      }
      bases.set(from.version, { version: from.version, tag: release.from })
    }
  })

  // Every listing of a changeset carries the commit that added it, also when it was reworded later; only a commit that
  // added several changesets (listed together, with different summaries) needs the summary to tell them apart
  const normalize = (summary: string) => summary.replace(/\s+/g, " ").trim()
  const summaries = new Map<string, number>()
  for (const release of releases) {
    const perCommit = new Map<string, Set<string>>()
    for (const { entries } of release.sections) {
      for (const { commit, summary } of entries) {
        perCommit.set(commit, (perCommit.get(commit) ?? new Set()).add(normalize(summary)))
      }
    }
    for (const [commit, set] of perCommit) {
      summaries.set(commit, Math.max(summaries.get(commit) ?? 0, set.size))
    }
  }
  const keys = new Map<string, number>()
  for (const release of releases) {
    for (const { entries } of release.sections) {
      for (const listed of entries) {
        const identity = summaries.get(listed.commit)! > 1 ? `${listed.commit} ${normalize(listed.summary)}` : listed.commit
        let key = keys.get(identity)
        if (key === undefined) {
          key = keys.size
          keys.set(identity, key)
        }
        listed.key = key
      }
    }
  }

  return { repo: repo!, releases, bases: [...bases.values()] }
}

const escapeHtml = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")

const isSafeUrl = (url: string) => /^(?:https?|mailto):/i.test(url)

// changeset text is GitHub-flavored markdown (bare URLs are links); raw HTML is shown as text, and only http(s) and
// mailto links and images are kept
const marked = new Marked({
  gfm: true,
  // after a raw <pre>, <code>, <kbd> or <script> tag marked passes the text that follows through unescaped, expecting the
  // tag to be rendered as HTML; the tags are shown as text here, so that text is escaped too
  walkTokens(token) {
    if (token.type === "text") {
      token.escaped = false
    }
  },
  renderer: {
    html: ({ text }) => escapeHtml(text),
    link({ href, tokens }) {
      const text = this.parser.parseInline(tokens)
      return isSafeUrl(href) ? `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${text}</a>` : text
    },
    image: ({ href, text }) => (isSafeUrl(href) ? `<img src="${escapeHtml(href)}" alt="${escapeHtml(text)}">` : escapeHtml(text)),
  },
})

export function renderMarkdown(markdown: string, inline = false): string {
  return inline ? marked.parseInline(markdown, { async: false }) : marked.parse(markdown, { async: false })
}

export default function changelogPlugin(context: LoadContext): Plugin<ChangelogData> {
  const file = join(context.siteDir, "..", "CHANGELOG.md")
  return {
    name: "electron-builder-changelog",
    getPathsToWatch() {
      return [file]
    },
    loadContent() {
      const changelog = parseChangelog(readFileSync(file, "utf8"))
      for (const release of changelog.releases) {
        for (const section of release.sections) {
          for (const entry of section.entries) {
            entry.summary = renderMarkdown(entry.summary, true)
            if (entry.body !== undefined) {
              entry.body = renderMarkdown(entry.body)
            }
          }
        }
      }
      return changelog
    },
    async contentLoaded({ content, actions }) {
      const changelog = await actions.createData("changelog.json", content)
      actions.addRoute({ path: `${context.baseUrl}changelog`, component: "@site/src/components/Changelog", modules: { changelog }, exact: true })
    },
  }
}
