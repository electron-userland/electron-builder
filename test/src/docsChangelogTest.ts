import * as path from "path"
import { beforeAll } from "vitest"
import changelogPlugin, { parseChangelog, renderMarkdown } from "../../website/scripts/docusaurus-plugin-changelog"
import { ancestors, BUMPS, compare, type Bump, type Change, type ChangelogData } from "../../website/src/changelog/model"

const REPO = "https://github.com/electron-userland/electron-builder"

// a commit hash from a short hex prefix
const sha = (prefix: string) => prefix.padEnd(40, "0")

// an entry as scripts/aggregate-changesets.mjs writes it: the first line with its links and note, the body indented by two spaces
function entry(summary: string, commit: string, options: { pr?: number; note?: string; body?: string } = {}): string {
  const links = `${options.pr === undefined ? "" : `[\`#${options.pr}\`](${REPO}/pull/${options.pr}) `}[\`${commit.slice(0, 7).padEnd(7, "0")}\`](${REPO}/commit/${sha(commit)})`
  const line = `- ${summary} _${links}_${options.note === undefined ? "" : ` — ${options.note}`}`
  return options.body === undefined
    ? line
    : `${line}\n\n${options.body
        .split("\n")
        .map(l => (l === "" ? l : `  ${l}`))
        .join("\n")}`
}

const group = (type: "Major" | "Minor" | "Patch", ...entries: string[]) => `### ${type} Changes\n\n${entries.join("\n")}`

const section = (label: string, ...content: string[]) => [`## ${label}`, ...content].join("\n\n")

// <label> is the version for electron-builder, "<pkg>@<version>" for a package released alone; <from> is a tag
function release(label: string, from: string | undefined, ...sections: string[]): string {
  const tag = label.includes("@") ? label : `electron-builder@${label}`
  const heading = from === undefined ? `# ${label} (2026-01-01)` : `# [${label}](${REPO}/compare/${from}...${tag}) (2026-01-01)`
  return [heading, ...sections].join("\n\n")
}

// the conventional-changelog history, where parsing stops
const CONVENTIONAL = `## [0.9.0](${REPO}/compare/v0.8.0...v0.9.0) (2025-01-01)\n\n\n### Bug Fixes\n\n* fix something ([abc1234](${REPO}/commit/abc1234))\n`

const changelog = (...releases: string[]) => [...releases, CONVENTIONAL].join("\n\n\n\n")

// "<bump> <summary>", plus " (updated)", in bucket order
const summarize = (changes: Record<Bump, Change[]>) => BUMPS.flatMap(bump => changes[bump].map(change => `${bump} ${change.entry.summary}${change.updated ? " (updated)" : ""}`))

describe("docs changelog", () => {
  test("parses every line form of the changesets format and stops at the conventional-changelog history", ({ expect }) => {
    const body = "First paragraph.\n\n- a nested item\n- another one\n\n```ts\nconst a = 1\n\n  indented\n```"
    const data = parseChangelog(
      changelog(
        release("electron-forge-maker-snap@2.0.2", undefined, section("electron-forge-maker-snap@2.0.2", group("Patch", entry("Fix(snap): released alone", "f1", { pr: 30 })))),
        release("electron-updater@1.1.1", "electron-updater@1.1.0", section("electron-updater@1.1.1", group("Patch", entry("Fix(updater): released alone", "e1", { pr: 20 })))),
        release(
          "2.0.0",
          "electron-builder@1.0.0",
          section(
            "electron-builder@2.0.0",
            // the next entry follows the body without a blank line
            group("Major", entry("Feat!: nest the options — see the guide", "a1", { pr: 10, note: "`electron-builder`, `app-builder-lib`", body }), entry("Fix: no PR", "a2")),
            group(
              "Minor",
              entry("Feat: one", "b1", { pr: 12, note: `\`app-builder-lib\` · updated in [\`#13\`](${REPO}/pull/13)` }),
              entry("Feat: two", "b2", { pr: 14, note: `updated in [\`#15\`](${REPO}/pull/15)` }),
              entry("Feat: three", "b3", { pr: 16, note: `updated in [\`abc1234\`](${REPO}/commit/${sha("abc1234")})` }),
              entry("Feat: four", "b4", { pr: 17, note: "updated" })
            )
          ),
          section("electron-updater@1.1.0", "Updated dependencies: `builder-util-runtime@9.3.0`, `builder-util@26.0.0`")
        )
      )
    )

    expect(data.repo).toBe(REPO)
    expect(data.releases.map(r => [r.id, r.pkg, r.version, r.from, r.tag, r.parent])).toEqual([
      ["electron-forge-maker-snap@2.0.2", "electron-forge-maker-snap", "2.0.2", undefined, undefined, "electron-updater@1.1.1"],
      ["electron-updater@1.1.1", "electron-updater", "1.1.1", "electron-updater@1.1.0", "electron-updater@1.1.1", "2.0.0"],
      ["2.0.0", "electron-builder", "2.0.0", "electron-builder@1.0.0", "electron-builder@2.0.0", "1.0.0"],
    ])
    expect(data.bases).toEqual([{ version: "1.0.0", tag: "electron-builder@1.0.0" }])

    const [builder, updater] = data.releases[2].sections
    expect(updater).toEqual({ pkg: "electron-updater", version: "1.1.0", dependencies: ["builder-util-runtime@9.3.0", "builder-util@26.0.0"], entries: [] })
    expect(builder.entries.map(({ key: _key, ...rest }) => rest)).toEqual([
      { bump: "major", summary: "Feat!: nest the options — see the guide", pr: 10, commit: sha("a1"), body },
      { bump: "major", summary: "Fix: no PR", commit: sha("a2") },
      { bump: "minor", summary: "Feat: one", pr: 12, commit: sha("b1"), updated: { pr: 13 } },
      { bump: "minor", summary: "Feat: two", pr: 14, commit: sha("b2"), updated: { pr: 15 } },
      { bump: "minor", summary: "Feat: three", pr: 16, commit: sha("b3"), updated: { commit: "abc1234" } },
      { bump: "minor", summary: "Feat: four", pr: 17, commit: sha("b4"), updated: {} },
    ])
    const keys = data.releases.flatMap(r => r.sections.flatMap(s => s.entries.map(e => e.key)))
    expect(new Set(keys).size).toBe(keys.length)
  })

  const HEAD = `# [2.0.0](${REPO}/compare/electron-builder@1.0.0...electron-builder@2.0.0) (2026-01-01)`
  const ENTRY = entry("Fix: a", "a1", { pr: 1 })
  const PATCH = ["## electron-builder@2.0.0", "", "### Patch Changes", ""]
  test.for([
    ["a conventional-changelog bullet in a release", [HEAD, "", ...PATCH, "* fix: a"], /^CHANGELOG\.md:7: unrecognized line$/],
    ["an entry outside a group", [HEAD, "", "## electron-builder@2.0.0", "", ENTRY], /^CHANGELOG\.md:5: unrecognized line$/],
    ["a body line indented by one space", [HEAD, "", ...PATCH, ENTRY, "", " body"], /^CHANGELOG\.md:9: unrecognized line$/],
    ["an entry without links", [HEAD, "", ...PATCH, "- Fix: a"], /^CHANGELOG\.md:7: unrecognized line$/],
    ["a malformed package heading", [HEAD, "", "## electron-builder 2.0.0", "", "### Patch Changes", "", ENTRY], /^CHANGELOG\.md:3: unrecognized line$/],
    ["a title before the releases", ["# Changelog", "", HEAD, "", ...PATCH, ENTRY], /no electron-builder release/],
    [
      "a compare link that ends at another release",
      [HEAD.replace("...electron-builder@2.0.0", "...electron-builder@2.0.1"), "", ...PATCH, ENTRY],
      /^CHANGELOG\.md:1: the compare link ends at electron-builder@2\.0\.1/,
    ],
    ["an electron-builder release without a compare link", ["# 2.0.0 (2026-01-01)", "", ...PATCH, ENTRY], /^CHANGELOG\.md:1: an electron-builder release without a compare link$/],
    [
      "a release heading without a GitHub compare link",
      [HEAD.replace("https://github.com", "https://example.com"), "", ...PATCH, ENTRY],
      /^CHANGELOG\.md:1: unrecognized release heading$/,
    ],
    [
      "a label that is not a version",
      [HEAD.replace(/2\.0\.0/g, "2.0"), "", "## electron-builder@2.0", "", "### Patch Changes", "", ENTRY],
      /^CHANGELOG\.md:1: "2\.0" is not a version$/,
    ],
    ["an unrecognized note", [HEAD, "", ...PATCH, entry("Fix: a", "a1", { pr: 1, note: "see #2" })], /^CHANGELOG\.md:7: unrecognized note "see #2"$/],
    ["an unrecognized updated note", [HEAD, "", ...PATCH, entry("Fix: a", "a1", { pr: 1, note: "updated by a bot" })], /^CHANGELOG\.md:7: unrecognized note "updated by a bot"$/],
    [
      "a compare link that starts at another package",
      [HEAD.replace("electron-builder@1.0.0", "electron-updater@1.0.0"), "", ...PATCH, ENTRY],
      /^CHANGELOG\.md:1: the compare link starts at electron-updater@1\.0\.0, not at an electron-builder release$/,
    ],
    [
      "a release that follows one missing from the file",
      [
        HEAD.replace(/2\.0\.0/g, "2.1.0").replace("electron-builder@1.0.0", "electron-builder@2.0.5"),
        "",
        "## electron-builder@2.1.0",
        "",
        "### Patch Changes",
        "",
        ENTRY,
        "",
        "",
        "",
        HEAD,
        "",
        ...PATCH,
        ENTRY,
      ],
      /^CHANGELOG\.md:1: 2\.1\.0 compares from electron-builder@2\.0\.5, which has no section in CHANGELOG\.md/,
    ],
    [
      "a package released alone that follows a release missing from the file",
      [
        `# [electron-updater@1.1.1](${REPO}/compare/electron-updater@1.0.9...electron-updater@1.1.1) (2026-01-01)`,
        "",
        "## electron-updater@1.1.1",
        "",
        "### Patch Changes",
        "",
        ENTRY,
        "",
        "",
        "",
        HEAD,
        "",
        ...PATCH,
        ENTRY,
      ],
      /^CHANGELOG\.md:1: electron-updater@1\.1\.1 compares from electron-updater@1\.0\.9, which has no section/,
    ],
  ] as const)("fails on %s", ([, lines, message], { expect }) => {
    expect(() => parseChangelog([...lines, "", CONVENTIONAL].join("\n"))).toThrow(message)
  })

  describe("compare", () => {
    const SHARED = { pr: 7, note: "`electron-builder`, `electron-updater`" }
    const NOTED = { pr: 2, note: `${SHARED.note} · updated in [\`#11\`](${REPO}/pull/11)` }
    const SEMANTICS = changelog(
      // a stable release lists every changeset of its prereleases again, with its final text
      release(
        "2.0.0",
        "electron-builder@1.5.0",
        section(
          "electron-builder@2.0.0",
          group("Major", entry("Feat!: x, final", "c1", { pr: 1 }), entry("Feat!: shared", "c7", SHARED)),
          group("Minor", entry("Feat: h, reworded for the stable release", "c8", { pr: 8 })),
          group(
            "Patch",
            entry("Fix: p", "c2", { pr: 2 }),
            entry("Fix: n", "c4", { pr: 4 }),
            entry("Fix: new in the stable release", "c5", { pr: 5 }),
            entry("Fix: double a", "c6", { pr: 6 }),
            entry("Fix: double b", "c6", { pr: 6 })
          )
        ),
        section("electron-updater@1.1.0", group("Patch", entry("Feat!: shared", "c7", SHARED), entry("Fix(updater): alone", "c9", { pr: 9 })))
      ),
      // c1 reworded and made major after 2.0.0-alpha.0 listed it, c2 listed again unchanged with an updated note; c6 added
      // two changesets; c7 is major for electron-updater only in this release
      release(
        "2.0.0-alpha.1",
        "electron-builder@2.0.0-alpha.0",
        section(
          "electron-builder@2.0.0-alpha.1",
          group("Major", entry("Feat!: x, final", "c1", { pr: 1, note: `updated in [\`#10\`](${REPO}/pull/10)` })),
          group(
            "Patch",
            entry("Feat!: shared", "c7", SHARED),
            entry("Fix: n", "c4", { pr: 4 }),
            entry("Fix: double a", "c6", { pr: 6 }),
            entry("Fix: double b", "c6", { pr: 6 }),
            entry("Fix: p", "c2", NOTED)
          )
        ),
        section("electron-updater@1.0.2", group("Major", entry("Feat!: shared", "c7", SHARED)), group("Patch", entry("Fix: p", "c2", NOTED)))
      ),
      // released alone between the two prereleases
      release("electron-updater@1.0.1", "electron-updater@1.0.0", section("electron-updater@1.0.1", group("Patch", entry("Fix(updater): alone", "c9", { pr: 9 })))),
      release(
        "2.0.0-alpha.0",
        "electron-builder@1.5.0",
        section(
          "electron-builder@2.0.0-alpha.0",
          group("Minor", entry("Feat: x", "c1", { pr: 1 }), entry("Feat: h", "c8", { pr: 8 })),
          group("Patch", entry("Fix: p", "c2", { ...SHARED, pr: 2 }))
        ),
        section("electron-updater@1.0.0", group("Patch", entry("Fix: p", "c2", { ...SHARED, pr: 2 })))
      ),
      // the parallel release line
      release("1.6.0", "electron-builder@1.5.0", section("electron-builder@1.6.0", group("Patch", entry("Fix: backport", "c3", { pr: 3 })))),
      release("1.5.0", "electron-builder@0.9.0", section("electron-builder@1.5.0", group("Patch", entry("Fix: s", "c0", { pr: 100 }))))
    )
    const data = parseChangelog(SEMANTICS)
    const changes = (from: string, to: string) => summarize(compare(data, from, to))
    const all = (from: string, to: string) => BUMPS.flatMap(bump => compare(data, from, to)[bump])

    test("contains the releases of its line and the packages released alone on it", ({ expect }) => {
      const ids = (id: string) => [...ancestors(data, id)].sort((a, b) => a - b).map(i => data.releases[i].id)
      expect(ids("2.0.0-alpha.1")).toEqual(["2.0.0-alpha.1", "electron-updater@1.0.1", "2.0.0-alpha.0", "1.5.0"])
      expect(ids("2.0.0")).toEqual(["2.0.0", "1.5.0"])
      expect(ids("1.6.0")).toEqual(["1.6.0", "1.5.0"])
      expect(ids("0.9.0")).toEqual([])
    })

    test("lists the changes of the other release line since the branch point only", ({ expect }) => {
      const expected = [
        "major Feat!: shared",
        "major Feat!: x, final",
        "minor Feat: h",
        "patch Fix: n",
        "patch Fix: double a",
        "patch Fix: double b",
        "patch Fix(updater): alone",
        "patch Fix: p",
      ]
      expect(changes("1.6.0", "2.0.0-alpha.1")).toEqual(expected)
      // a reworded changeset that <from> never had is listed once, with the newest text
      expect(changes("1.5.0", "2.0.0-alpha.1")).toEqual(expected)
    })

    test("labels a change with the package sections of its newest listing and the release that listed it first", ({ expect }) => {
      const [shared, reworded] = compare(data, "1.6.0", "2.0.0-alpha.1").major
      expect(shared.sections.map(s => `${s.pkg}@${s.version}`)).toEqual(["electron-builder@2.0.0-alpha.1", "electron-updater@1.0.2"])
      expect([reworded.release.id, reworded.introducedIn.id]).toEqual(["2.0.0-alpha.1", "2.0.0-alpha.0"])
    })

    test("lists only the new and the updated changesets of a cumulative stable release", ({ expect }) => {
      expect(changes("2.0.0-alpha.1", "2.0.0")).toEqual(["minor Feat: h, reworded for the stable release (updated)", "patch Fix: new in the stable release"])
    })

    test("marks a changeset listed again with an updated note", ({ expect }) => {
      expect(changes("2.0.0-alpha.0", "2.0.0-alpha.1")).toEqual([
        "major Feat!: shared",
        "major Feat!: x, final (updated)",
        "patch Fix: n",
        "patch Fix: double a",
        "patch Fix: double b",
        "patch Fix(updater): alone",
        "patch Fix: p (updated)",
      ])
    })

    test("finds nothing going back", ({ expect }) => {
      // from a stable release to its own prerelease, which lists a changeset with an updated note
      expect(changes("2.0.0", "2.0.0-alpha.1")).toEqual([])
      expect(changes("2.0.0-alpha.1", "2.0.0-alpha.0")).toEqual([])
      expect(changes("2.0.0-alpha.1", "2.0.0-alpha.1")).toEqual([])
    })

    test("compares from a base", ({ expect }) => {
      expect(changes("0.9.0", "1.6.0")).toEqual(["patch Fix: backport", "patch Fix: s"])
    })

    test("leaves out a package released alone after the release compared to", ({ expect }) => {
      expect(changes("0.9.0", "2.0.0-alpha.0")).toEqual(["minor Feat: x", "minor Feat: h", "patch Fix: p", "patch Fix: s"])
      expect(changes("1.5.0", "1.6.0")).toEqual(["patch Fix: backport"])
    })

    test("orders each bucket by the release that listed the changeset first, newest first", ({ expect }) => {
      expect(all("0.9.0", "2.0.0").map(change => change.introducedIn.id)).toEqual([
        "2.0.0-alpha.1",
        "2.0.0-alpha.0",
        "2.0.0-alpha.0",
        "2.0.0",
        "2.0.0-alpha.1",
        "2.0.0-alpha.1",
        "2.0.0-alpha.1",
        "electron-updater@1.0.1",
        "2.0.0-alpha.0",
        "1.5.0",
      ])
    })

    test("lists a reworded changeset of a commit with several changesets as a new change (known limit)", ({ expect }) => {
      const reworded = parseChangelog(SEMANTICS.replace("- Fix: double b _", "- Fix: double b, reworded _"))
      expect(summarize(compare(reworded, "2.0.0-alpha.1", "2.0.0"))).toEqual([
        "minor Feat: h, reworded for the stable release (updated)",
        "patch Fix: new in the stable release",
        "patch Fix: double b, reworded",
      ])
      expect(summarize(compare(reworded, "2.0.0", "2.0.0-alpha.1"))).toEqual(["patch Fix: double b"])
    })
  })

  test("renders markdown as HTML with raw HTML as text and only http(s) and mailto links and images", ({ expect }) => {
    expect(renderMarkdown("a <b>bold</b> <script>x()</script>", true)).toBe("a &lt;b&gt;bold&lt;/b&gt; &lt;script&gt;x()&lt;/script&gt;")
    expect(renderMarkdown("<div onclick=x>hi</div>")).toBe("&lt;div onclick=x&gt;hi&lt;/div&gt;")
    // marked passes the text after a raw <code>, <pre>, <kbd> or <script> tag through unless it is told to escape it
    expect(renderMarkdown("<code> <img/src=x onerror=alert(1)> a & b", true)).toBe("&lt;code&gt; &lt;img/src=x onerror=alert(1)&gt; a &amp; b")
    expect(renderMarkdown("Note about <pre> tags\n\nSecond <img/src=x onerror=alert(1)>")).toBe(
      "<p>Note about &lt;pre&gt; tags</p>\n<p>Second &lt;img/src=x onerror=alert(1)&gt;</p>\n"
    )
    expect(renderMarkdown("[js](javascript:alert(1)) [rel](./foo.md) ![img](javascript:alert(1))", true)).toBe("js rel img")
    expect(renderMarkdown("[ok](https://example.com/?a=1&b=2) [mail](mailto:a@b.co) ![y](https://example.com/a.png)", true)).toBe(
      '<a href="https://example.com/?a=1&amp;b=2" target="_blank" rel="noopener noreferrer">ok</a> <a href="mailto:a@b.co" target="_blank" rel="noopener noreferrer">mail</a> <img src="https://example.com/a.png" alt="y">'
    )
    expect(renderMarkdown("see https://example.com/x", true)).toBe('see <a href="https://example.com/x" target="_blank" rel="noopener noreferrer">https://example.com/x</a>')
    expect(renderMarkdown("```ts\nconst a = 1 < 2\n\nconst b = 2\n```")).toBe('<pre><code class="language-ts">const a = 1 &lt; 2\n\nconst b = 2\n</code></pre>\n')
  })

  describe("the root CHANGELOG.md", () => {
    let real: ChangelogData
    beforeAll(async () => {
      const plugin = changelogPlugin({ siteDir: path.resolve(__dirname, "../../website"), baseUrl: "/" } as Parameters<typeof changelogPlugin>[0])
      real = await plugin.loadContent!()
    })
    const index = (id: string | undefined) => real.releases.findIndex(release => release.id === id)
    const builder = () => real.releases.filter(release => release.pkg === "electron-builder")

    test("renders only the tags marked writes, with http(s) and mailto links and images", ({ expect }) => {
      // marked's GitHub-flavored markdown output, with the link and image renderers of the plugin
      const written =
        /<(?:\/?(?:p|ul|li|em|strong|del|pre|code|blockquote|h[1-6]|table|thead|tbody|tr)|\/(?:ol|th|td|a)|ol(?: start="\d+")?|t[hd](?: align="(?:left|center|right)")?|code class="language-[^"<>]*"|input (?:checked="" )?disabled="" type="checkbox"|a href="(?:https?|mailto):[^"<>]*" target="_blank" rel="noopener noreferrer"|img src="(?:https?|mailto):[^"<>]*" alt="[^"<>]*"|br|hr)>/g
      const html = real.releases.flatMap(r => r.sections.flatMap(s => s.entries.flatMap(e => [e.summary, e.body ?? ""])))
      expect(html.filter(h => h.replace(written, "").includes("<"))).toEqual([])
    })

    test("reads the releases since 24.0.0, each following an older one or the base 23.6.0", ({ expect }) => {
      expect(builder()[builder().length - 1].id).toBe("24.0.0")
      expect(real.bases).toEqual([{ version: "23.6.0", tag: "v23.6.0" }])
      for (const release of builder()) {
        const parent = index(release.parent)
        expect([release.id, release.parent, parent === -1 ? release.parent === "23.6.0" : parent > index(release.id)]).toEqual([release.id, release.parent, true])
      }
    })

    test("compares each release with the one it follows by the releases in between only", ({ expect }) => {
      for (const release of builder()) {
        const added = ancestors(real, release.id)
        for (const i of ancestors(real, release.parent!)) {
          added.delete(i)
        }
        for (const change of BUMPS.flatMap(bump => compare(real, release.parent!, release.id)[bump])) {
          expect([release.id, added.has(index(change.release.id))]).toEqual([release.id, true])
        }
      }
    })

    test("compares across release lines, cumulative releases and updated changesets", ({ expect }) => {
      const counts = (from: string, to: string) => BUMPS.map(bump => compare(real, from, to)[bump].length)
      const keys = (from: string, to: string) => BUMPS.flatMap(bump => compare(real, from, to)[bump].map(change => change.entry.key)).sort((a, b) => a - b)
      // only the 27 alphas: 26.15.4 .. 26.17.0 were released from release/v26 in parallel
      expect(counts("26.15.3", "27.0.0-alpha.11")).toEqual([41, 38, 151])
      expect(keys("26.17.0", "27.0.0-alpha.11")).toEqual(keys("26.15.3", "27.0.0-alpha.11"))
      // 26.0.0 follows 25.1.8 and lists the changesets of its alphas again
      expect(counts("25.1.6", "26.0.0")).toEqual([5, 11, 44])
      // across all of v25
      expect(counts("24.13.3", "26.0.0")).toEqual([5, 25, 142])
      // v24 and v25 also list the commits that were released without a changeset
      expect(compare(real, "25.0.4", "25.0.5").minor.map(change => change.entry.pr)).toContain(8143)
      expect(compare(real, "24.13.3", "25.0.0").patch.map(change => change.entry.pr)).toContain(8171)
      expect(counts("26.0.0-alpha.5", "26.0.0")).toEqual([3, 6, 20])
      expect(counts("26.0.0-alpha.11", "26.0.0")).toEqual([0, 0, 0])
      expect(counts("27.0.0-alpha.11", "26.15.3")).toEqual([0, 0, 0])
      // d45536f was made breaking after 27.0.0-alpha.9 listed it as a minor change
      const updated = compare(real, "27.0.0-alpha.9", "27.0.0-alpha.10").major.find(change => change.entry.commit.startsWith("d45536f"))
      expect([updated?.updated, updated?.release.id, updated?.introducedIn.id]).toEqual([true, "27.0.0-alpha.10", "27.0.0-alpha.9"])
    })
  })
})
