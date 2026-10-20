import { spawnSync } from "node:child_process"
import * as fs from "node:fs"
import { createRequire } from "node:module"
import * as path from "node:path"
import { TmpDir } from "temp-file"
import { vi } from "vitest"

// scripts/aggregate-changesets.mjs on throwaway git repos versioned by the real changesets CLI (and its pnpm patches),
// with an offline changelog generator instead of changesets-changelog-clean (which looks up PRs on GitHub)
const REPO_ROOT = path.resolve(__dirname, "../../")
const CHANGESET = path.join(REPO_ROOT, "node_modules/@changesets/cli/bin.js")
const SCRIPT = path.join(REPO_ROOT, "scripts/aggregate-changesets.mjs")
const COMPARE = "https://github.com/owner/repo/compare"
const LEGACY = "# [1.0.0](https://github.com/owner/repo/compare/v0.9.0...v1.0.0) (2020-01-01)\n\n\n### Features\n\n* the first release\n"

const CHANGELOG_GENERATOR = `module.exports = {
  getReleaseLine: async changeset => {
    const [first, ...rest] = changeset.summary.split("\\n")
    const line = \`- \${first} (\${changeset.commit.slice(0, 7)})\`
    return rest.length ? \`\${line}\\n\${rest.map(l => (l ? \`  \${l}\` : l)).join("\\n")}\` : line
  },
  getDependencyReleaseLine: async () => "",
}
`

function exec(dir: string, file: string, args: Array<string>) {
  // isolated from the user's git config (signing, hooks)
  const gitConfig = path.join(dir, "..", "gitconfig")
  fs.writeFileSync(gitConfig, "[user]\n\tname = test\n\temail = test@example.com\n")
  const result = spawnSync(file, args, { cwd: dir, encoding: "utf8", env: { ...process.env, GIT_CONFIG_GLOBAL: gitConfig, GIT_CONFIG_NOSYSTEM: "1" } })
  if (result.status !== 0) {
    throw new Error(`${file} ${args.join(" ")} failed (${result.status}):\n${result.stdout}\n${result.stderr}`)
  }
  return result
}

const git = (dir: string, ...args: Array<string>) => exec(dir, "git", args).stdout.trim()
const changeset = (dir: string, ...args: Array<string>) => exec(dir, process.execPath, [CHANGESET, ...args])
const aggregate = (dir: string, ...args: Array<string>) => exec(dir, process.execPath, [SCRIPT, ...args])

function write(dir: string, file: string, content: string) {
  fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true })
  fs.writeFileSync(path.join(dir, file), content)
}

function commit(dir: string, message: string) {
  git(dir, "add", "-A")
  git(dir, "commit", "-q", "-m", message)
  return git(dir, "rev-parse", "--short=7", "HEAD")
}

const writeChangeset = (dir: string, id: string, releases: Record<string, string>, summary: string) =>
  write(
    dir,
    `.changeset/${id}.md`,
    `---\n${Object.entries(releases)
      .map(([name, type]) => `"${name}": ${type}`)
      .join("\n")}\n---\n\n${summary}\n`
  )

// electron-builder and app-builder-lib (linked), builder-util-runtime (a dependency of both), electron-updater, and an
// ignored private package; in pre mode with the changesets of a first prerelease
async function createRepo(tmpDir: TmpDir) {
  const dir = path.join(await tmpDir.createTempDir({ prefix: "aggregate-changesets" }), "repo")
  const pkg = (name: string, dependencies: Record<string, string>, extra: Record<string, unknown> = {}) =>
    write(dir, `packages/${name.replace("@fixture/", "")}/package.json`, `${JSON.stringify({ name, version: "1.0.0", ...extra, dependencies }, null, 2)}\n`)
  write(dir, "package.json", `${JSON.stringify({ name: "fixture", private: true })}\n`)
  write(dir, "pnpm-workspace.yaml", "packages:\n  - packages/*\n")
  pkg("electron-builder", { "app-builder-lib": "workspace:*", "builder-util-runtime": "workspace:*" })
  pkg("app-builder-lib", { "builder-util-runtime": "workspace:*" })
  pkg("builder-util-runtime", {})
  pkg("electron-updater", { "builder-util-runtime": "workspace:*" })
  pkg("@fixture/website", {}, { version: "0.0.0", private: true })
  const config = {
    changelog: ["./changelog.cjs", { repo: "owner/repo" }],
    prettier: false,
    commit: false,
    linked: [["electron-builder", "app-builder-lib"]],
    access: "public",
    baseBranch: "master",
    updateInternalDependencies: "patch",
    ignore: ["@fixture/website"],
  }
  write(dir, ".changeset/config.json", `${JSON.stringify(config, null, 2)}\n`)
  write(dir, ".changeset/changelog.cjs", CHANGELOG_GENERATOR)
  write(dir, "CHANGELOG.md", LEGACY)
  git(dir, "init", "-q", "-b", "master")
  commit(dir, "chore: initial")
  git(dir, "tag", "electron-builder@1.0.0")
  changeset(dir, "pre", "enter", "alpha")
  commit(dir, "chore: enter pre mode")

  writeChangeset(dir, "a-builder-major", { "app-builder-lib": "major" }, "feat!: builder breaking\n\nMigrate with `x`.")
  writeChangeset(dir, "b-updater-minor", { "electron-updater": "minor" }, "feat: updater feature")
  writeChangeset(dir, "c-runtime-only", { "builder-util-runtime": "patch" }, "fix: runtime fix")
  writeChangeset(dir, "d-builder-runtime", { "app-builder-lib": "patch", "builder-util-runtime": "patch" }, "fix: builder and runtime")
  writeChangeset(dir, "e-updater-runtime", { "electron-updater": "patch", "builder-util-runtime": "minor" }, "fix: updater and runtime")
  writeChangeset(dir, "f-ignored-only", { "@fixture/website": "patch" }, "docs: website only")
  return { dir, sha: commit(dir, "feat: the first changesets (#1)") }
}

// `changeset version` and the root changelog, as ci:version runs them
function version(dir: string) {
  changeset(dir, "version")
  return aggregate(dir, "--mode", "after-version", "--insert", "CHANGELOG.md")
}

const rootChangelog = (dir: string) => fs.readFileSync(path.join(dir, "CHANGELOG.md"), "utf8")
const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
// a release heading is dated the day the script wrote it
const dateOf = (dir: string, version: string) => new RegExp(`^# \\[${escapeRegExp(version)}\\]\\(.*\\) \\((\\d{4}-\\d{2}-\\d{2})\\)$`, "m").exec(rootChangelog(dir))?.[1]
const notes = (dir: string, tag: string) => aggregate(dir, "--notes", tag).stdout

describe("aggregate-changesets", () => {
  test("writes one section per release, with an electron-builder and an electron-updater sub-section", async ({ expect, tmpDir }) => {
    const { dir, sha } = await createRepo(tmpDir)
    const preview = aggregate(dir, "--mode", "next").stdout

    version(dir)
    const section = [
      `# [2.0.0-alpha.0](${COMPARE}/electron-builder@1.0.0...electron-builder@2.0.0-alpha.0) (${dateOf(dir, "2.0.0-alpha.0")})`,
      "",
      "## electron-builder@2.0.0-alpha.0",
      "",
      "### Major Changes",
      "",
      `- feat!: builder breaking (${sha}) — \`app-builder-lib\``,
      "",
      "  Migrate with `x`.",
      "",
      "### Patch Changes",
      "",
      `- fix: runtime fix (${sha}) — \`builder-util-runtime\``,
      `- fix: builder and runtime (${sha}) — \`app-builder-lib\`, \`builder-util-runtime\``,
      "",
      "## electron-updater@1.1.0-alpha.0",
      "",
      "### Minor Changes",
      "",
      `- feat: updater feature (${sha})`,
      "",
      "### Patch Changes",
      "",
      `- fix: runtime fix (${sha}) — \`builder-util-runtime\``,
      `- fix: builder and runtime (${sha}) — \`builder-util-runtime\``,
      `- fix: updater and runtime (${sha}) — \`electron-updater\`, \`builder-util-runtime\``,
      "",
    ].join("\n")
    expect(rootChangelog(dir)).toBe(`${section}\n\n\n${LEGACY}`)
    // the preview before `changeset version` is what it releases
    expect(preview).toBe(section)
    // a re-run replaces the section
    expect(aggregate(dir, "--mode", "after-version", "--insert", "CHANGELOG.md").stderr).toContain("replaced the 2.0.0-alpha.0 section")
    expect(rootChangelog(dir)).toBe(`${section}\n\n\n${LEGACY}`)

    // the release bodies: a sub-section each, the compare link for electron-builder
    expect(notes(dir, "electron-builder@2.0.0-alpha.0")).toBe(
      `${section.split("\n").slice(4, 14).join("\n")}\n\n**Full Changelog**: ${COMPARE}/electron-builder@1.0.0...electron-builder@2.0.0-alpha.0\n`
    )
    expect(notes(dir, "electron-updater@1.1.0-alpha.0")).toBe(`${section.split("\n").slice(17, 26).join("\n")}\n`)
    // a release written by conventional-changelog has no sub-sections: all of it is the electron-builder release body
    expect(notes(dir, "electron-builder@1.0.0")).toBe(`### Features\n\n* the first release\n\n**Full Changelog**: ${COMPARE}/v0.9.0...v1.0.0\n`)
  })

  test("lists a released changeset again when it was edited before the next prerelease", async ({ expect, tmpDir }) => {
    const { dir, sha } = await createRepo(tmpDir)
    version(dir)
    commit(dir, "chore(deploy): Release (#2)")
    git(dir, "tag", "electron-builder@2.0.0-alpha.0")

    writeChangeset(dir, "a-builder-major", { "app-builder-lib": "major" }, "feat!: builder breaking, reworded\n\nMigrate with `x`.")
    commit(dir, "docs: reword the builder changeset (#3)")
    writeChangeset(dir, "b-updater-minor", { "electron-updater": "major" }, "feat!: updater feature, now breaking")
    commit(dir, "docs: reword the updater changeset (#4)")
    writeChangeset(dir, "g-builder-patch", { "app-builder-lib": "patch" }, "fix: another builder fix")
    const sha2 = commit(dir, "fix: another builder fix (#5)")
    const preview = aggregate(dir, "--mode", "next").stdout

    const { stderr } = version(dir)
    const section = [
      `# [2.0.0-alpha.1](${COMPARE}/electron-builder@2.0.0-alpha.0...electron-builder@2.0.0-alpha.1) (${dateOf(dir, "2.0.0-alpha.1")})`,
      "",
      "## electron-builder@2.0.0-alpha.1",
      "",
      "### Major Changes",
      "",
      `- feat!: builder breaking, reworded (${sha}) — \`app-builder-lib\` · updated in [\`#3\`](https://github.com/owner/repo/pull/3)`,
      "",
      "  Migrate with `x`.",
      "",
      "### Patch Changes",
      "",
      `- fix: another builder fix (${sha2}) — \`app-builder-lib\``,
      "",
    ].join("\n")
    expect(rootChangelog(dir).startsWith(`${section}\n\n\n# [2.0.0-alpha.0]`)).toBe(true)
    expect(preview).toBe(section)
    // electron-updater is not released this time: its edited changeset is left out, with a warning
    expect(stderr).toContain(".changeset/b-updater-minor.md (electron-updater) was updated, but none of its packages is released now; left out")

    // the same release, read back from git
    commit(dir, "chore(deploy): Release (#6)")
    git(dir, "tag", "electron-builder@2.0.0-alpha.1")
    expect(aggregate(dir, "--mode", "range", "--from", "electron-builder@2.0.0-alpha.0", "--to", "electron-builder@2.0.0-alpha.1").stdout).toBe(section)
  })

  test("leaving pre mode releases every changeset of the prereleases and no ignored package", async ({ expect, tmpDir }) => {
    const { dir, sha } = await createRepo(tmpDir)
    version(dir)
    commit(dir, "chore(deploy): Release (#2)")
    git(dir, "tag", "electron-builder@2.0.0-alpha.0")
    // a released changeset reworded before the stable release: listed once, with its final text
    writeChangeset(dir, "a-builder-major", { "app-builder-lib": "major" }, "feat!: builder breaking, reworded\n\nMigrate with `x`.")
    commit(dir, "docs: reword the builder changeset (#3)")
    changeset(dir, "pre", "exit")
    commit(dir, "chore: exit pre mode")

    version(dir)
    const changelog = rootChangelog(dir)
    expect(changelog.split("\n").filter(line => line.startsWith("#"))).toEqual([
      `# [2.0.0](${COMPARE}/electron-builder@1.0.0...electron-builder@2.0.0) (${dateOf(dir, "2.0.0")})`,
      "## electron-builder@2.0.0",
      "### Major Changes",
      "### Patch Changes",
      "## electron-updater@1.1.0",
      "### Minor Changes",
      "### Patch Changes",
      `# [2.0.0-alpha.0](${COMPARE}/electron-builder@1.0.0...electron-builder@2.0.0-alpha.0) (${dateOf(dir, "2.0.0-alpha.0")})`,
      "## electron-builder@2.0.0-alpha.0",
      "### Major Changes",
      "### Patch Changes",
      "## electron-updater@1.1.0-alpha.0",
      "### Minor Changes",
      "### Patch Changes",
      "# [1.0.0](https://github.com/owner/repo/compare/v0.9.0...v1.0.0) (2020-01-01)",
      "### Features",
    ])
    expect(changelog).toContain(`## electron-builder@2.0.0\n\n### Major Changes\n\n- feat!: builder breaking, reworded (${sha}) — \`app-builder-lib\`\n`)
    expect(changelog).toContain(`## electron-updater@1.1.0\n\n### Minor Changes\n\n- feat: updater feature (${sha})\n`)
    expect(changelog.split("\n\n\n\n")[0]).not.toContain("updated in")
    // @changesets/assemble-release-plan patch (changesets/changesets#2092): the ignored package keeps its version
    expect(JSON.parse(fs.readFileSync(path.join(dir, "packages/website/package.json"), "utf8")).version).toBe("0.0.0")
    expect(fs.existsSync(path.join(dir, "packages/website/CHANGELOG.md"))).toBe(false)

    // the same release read back from git: `changeset version` deleted the changeset files it released
    commit(dir, "chore(deploy): Release (#4)")
    git(dir, "tag", "electron-builder@2.0.0")
    expect(aggregate(dir, "--mode", "range", "--from", "electron-builder@2.0.0-alpha.0", "--to", "electron-builder@2.0.0").stdout).toBe(`${changelog.split("\n\n\n\n")[0]}\n`)
  })

  test("leaves out a private package that is versioned on its own", async ({ expect, tmpDir }) => {
    const { dir } = await createRepo(tmpDir)
    // added in pre mode, as docker/ was: not in initialVersions, neither ignored nor linked
    write(dir, "packages/docker/package.json", `${JSON.stringify({ name: "docker", version: "1.0.0", private: true }, null, 2)}\n`)
    writeChangeset(dir, "g-private-only", { docker: "minor" }, "feat: private package feature")
    writeChangeset(dir, "h-private-builder", { docker: "patch", "app-builder-lib": "patch" }, "fix: private package and builder")
    const sha = commit(dir, "feat: a private package (#2)")
    const preview = aggregate(dir, "--mode", "next").stdout

    version(dir)
    expect(rootChangelog(dir)).toBe(`${preview}\n\n\n${LEGACY}`)
    expect(preview).toContain(`- fix: private package and builder (${sha}) — \`app-builder-lib\`\n`)
    expect(preview).not.toContain("private package feature")
    expect(preview).not.toContain("docker")
    // `changeset version` still versions it, with its own changelog
    const docker = (file: string) => fs.readFileSync(path.join(dir, "packages/docker", file), "utf8")
    expect(JSON.parse(docker("package.json")).version).toBe("1.1.0-alpha.0")
    expect(docker("CHANGELOG.md")).toContain(`- feat: private package feature (${sha})`)

    // a release of the private package alone writes no section
    commit(dir, "chore(deploy): Release (#3)")
    writeChangeset(dir, "i-private-only", { docker: "patch" }, "fix: private package fix")
    commit(dir, "fix: private package fix (#4)")
    const released = rootChangelog(dir)
    expect(aggregate(dir, "--mode", "next").stderr).toContain("no released packages found (mode next), nothing written")
    expect(version(dir).stderr).toContain("no released packages found (mode after-version), nothing written")
    expect(rootChangelog(dir)).toBe(released)
    expect(JSON.parse(docker("package.json")).version).toBe("1.1.0-alpha.1")
  })

  test("rewrites a past release in place and keeps its date", async ({ expect, tmpDir }) => {
    const { dir } = await createRepo(tmpDir)
    version(dir)
    commit(dir, "chore(deploy): Release (#2)")
    git(dir, "tag", "electron-builder@2.0.0-alpha.0")
    const released = rootChangelog(dir)
    const releasedDate = dateOf(dir, "2.0.0-alpha.0")
    // as conventional-changelog wrote it
    const conventional = `# [2.0.0-alpha.0](${COMPARE}/electron-builder@1.0.0...electron-builder@2.0.0-alpha.0) (2020-02-02)\n\n\n### Bug Fixes\n\n* a commit\n\n\n\n`
    fs.writeFileSync(path.join(dir, "CHANGELOG.md"), `${conventional}${LEGACY}`)

    aggregate(dir, "--mode", "range", "--from", "electron-builder@1.0.0", "--to", "electron-builder@2.0.0-alpha.0", "--insert", "CHANGELOG.md")
    expect(rootChangelog(dir)).toBe(released.replace(`(${releasedDate})`, "(2020-02-02)"))
  })

  test("shortens a release body to --max-chars, links first", async ({ expect, tmpDir }) => {
    const { dir } = await createRepo(tmpDir)
    // entries as .changeset/changelog.cjs writes them
    const links = (pr: number, sha: string) => `_[\`#${pr}\`](https://github.com/owner/repo/pull/${pr}) [\`${sha}\`](https://github.com/owner/repo/commit/${sha.repeat(6)}abcd)_`
    const compare = `${COMPARE}/electron-builder@1.0.0...electron-builder@2.0.0`
    write(
      dir,
      "CHANGELOG.md",
      [
        `# [2.0.0](${compare}) (2020-03-03)`,
        "",
        "## electron-builder@2.0.0",
        "",
        "### Major Changes",
        "",
        `- feat!: builder breaking ${links(11, "aaaaaaa")} — \`app-builder-lib\``,
        "",
        "  Migrate with `x`.",
        "",
        "### Minor Changes",
        "",
        `- feat: a feature ${links(12, "bbbbbbb")}`,
        "",
        "### Patch Changes",
        "",
        `- fix: one ${links(13, "ccccccc")} — \`builder-util-runtime\``,
        "",
        "  More about the fix, longer than the notice of the next step grows.",
        `- fix: two ${links(14, "ddddddd")} · updated in [\`#15\`](https://github.com/owner/repo/pull/15)`,
        "",
        "## electron-updater@1.1.0",
        "",
        "### Patch Changes",
        "",
        `- fix: updater ${links(16, "eeeeeee")}`,
        "",
        `${LEGACY}`,
      ].join("\n")
    )
    const full = notes(dir, "electron-builder@2.0.0")
    expect(full).toContain(links(11, "aaaaaaa"))

    const notice = (what: string) =>
      `> Shortened to fit GitHub's release size limit (${what}). The complete notes are in [CHANGELOG.md](https://github.com/owner/repo/blob/electron-builder@2.0.0/CHANGELOG.md).`
    const linksOnly = [
      notice("links shortened to #PR references"),
      "",
      "### Major Changes",
      "",
      "- feat!: builder breaking _#11_ — `app-builder-lib`",
      "",
      "  Migrate with `x`.",
      "",
      "### Minor Changes",
      "",
      "- feat: a feature _#12_",
      "",
      "### Patch Changes",
      "",
      "- fix: one _#13_ — `builder-util-runtime`",
      "",
      "  More about the fix, longer than the notice of the next step grows.",
      "",
      "- fix: two _#14_ · updated in #15",
      "",
      `**Full Changelog**: ${compare}`,
      "",
    ].join("\n")
    expect(full.length).toBeGreaterThan(linksOnly.length)
    // 1. just fits with the links collapsed to #PR references
    const shortened = aggregate(dir, "--notes", "electron-builder@2.0.0", "--max-chars", String(linksOnly.length))
    expect(shortened.stdout).toBe(linksOnly)
    expect(shortened.stderr).toContain(`${linksOnly.length} characters (links shortened to #PR references)`)

    // 2. one character less: the patch entries lose their continuation lines
    const patchFirstLines = aggregate(dir, "--notes", "electron-builder@2.0.0", "--max-chars", String(linksOnly.length - 1)).stdout
    expect(patchFirstLines.length).toBeLessThan(linksOnly.length)
    expect(patchFirstLines).toBe(
      linksOnly
        .replace(notice("links shortened to #PR references"), notice("links shortened, patch entries reduced to their first line"))
        .replace("\n\n  More about the fix, longer than the notice of the next step grows.\n\n", "\n")
    )

    // 4. every entry reduced to its first line
    const firstLines = linksOnly
      .replace(notice("links shortened to #PR references"), notice("links shortened, every entry reduced to its first line"))
      .replace("\n\n  Migrate with `x`.", "")
      .replace("\n\n  More about the fix, longer than the notice of the next step grows.\n\n", "\n")
    expect(aggregate(dir, "--notes", "electron-builder@2.0.0", "--max-chars", String(firstLines.length)).stdout).toBe(firstLines)

    // 5. one character less: the last patch entries are left out (both: "…and 1 more" is longer than the last entry)
    const limit = firstLines.length - 1
    const dropped = aggregate(dir, "--notes", "electron-builder@2.0.0", "--max-chars", String(limit))
    expect(dropped.stdout.length).toBeLessThanOrEqual(limit)
    expect(dropped.stdout).toBe(
      firstLines
        .replace(notice("links shortened, every entry reduced to its first line"), notice("every entry reduced to its first line, the last entries left out"))
        .replace("- fix: one _#13_ — `builder-util-runtime`\n- fix: two _#14_ · updated in #15", "- …and 2 more patch changes, see the complete notes")
    )
    expect(dropped.stderr).toContain("(first lines, 2 entries left out)")

    for (const bad of ["0", "-5", "12k", "1.5", ""]) {
      const result = spawnSync(process.execPath, [SCRIPT, "--notes", "electron-builder@2.0.0", `--max-chars=${bad}`], { cwd: dir, encoding: "utf8" })
      expect(result.status).toBe(1)
      expect(result.stderr).toBe(`aggregate-changesets: --max-chars must be a positive integer, got "${bad}"\n`)
    }
    const withoutNotes = spawnSync(process.execPath, [SCRIPT, "--max-chars", "100"], { cwd: dir, encoding: "utf8" })
    expect(withoutNotes.status).toBe(1)
    expect(withoutNotes.stderr).toBe("aggregate-changesets: --max-chars needs --notes\n")
  })

  test("puts a missing past release of electron-updater alone between its newer and older releases", async ({ expect, tmpDir }) => {
    const { dir } = await createRepo(tmpDir)
    version(dir)
    commit(dir, "chore(deploy): Release (#2)")
    git(dir, "tag", "electron-builder@2.0.0-alpha.0")
    git(dir, "tag", "electron-updater@1.1.0-alpha.0")
    for (const [i, pre] of ["1", "2"].entries()) {
      writeChangeset(dir, `h-updater-fix-${pre}`, { "electron-updater": "patch" }, `fix: updater fix ${pre}`)
      commit(dir, `fix: updater fix ${pre} (#${3 + 2 * i})`)
      version(dir)
      commit(dir, `chore(deploy): Release (#${4 + 2 * i})`)
      git(dir, "tag", `electron-updater@1.1.0-alpha.${pre}`)
    }
    const released = rootChangelog(dir)
    const sections = released.split("\n\n\n\n")
    expect(sections.map(s => s.split("\n")[0])).toEqual([
      `# [electron-updater@1.1.0-alpha.2](${COMPARE}/electron-updater@1.1.0-alpha.1...electron-updater@1.1.0-alpha.2) (${dateOf(dir, "electron-updater@1.1.0-alpha.2")})`,
      `# [electron-updater@1.1.0-alpha.1](${COMPARE}/electron-updater@1.1.0-alpha.0...electron-updater@1.1.0-alpha.1) (${dateOf(dir, "electron-updater@1.1.0-alpha.1")})`,
      `# [2.0.0-alpha.0](${COMPARE}/electron-builder@1.0.0...electron-builder@2.0.0-alpha.0) (${dateOf(dir, "2.0.0-alpha.0")})`,
      LEGACY.split("\n")[0],
    ])
    // electron-updater@1.1.0-alpha.1 missing: it goes below the newer 1.1.0-alpha.2 and above the release that has the
    // older electron-updater@1.1.0-alpha.0 sub-section, not to the top
    fs.writeFileSync(path.join(dir, "CHANGELOG.md"), [sections[0], ...sections.slice(2)].join("\n\n\n\n"))
    const { stderr } = aggregate(dir, "--mode", "range", "--from", "electron-updater@1.1.0-alpha.0", "--to", "electron-updater@1.1.0-alpha.1", "--insert", "CHANGELOG.md")
    expect(stderr).toContain("inserted the electron-updater@1.1.0-alpha.1 section")
    expect(rootChangelog(dir)).toBe(released)
  })

  test("the changelog generator links an entry to its PR and commit, without its author", async ({ expect }) => {
    // .changeset/changelog.cjs, with the GitHub lookup of changesets-changelog-clean (this very module instance) stubbed
    const requireGenerator = createRequire(path.join(REPO_ROOT, ".changeset/changelog.cjs"))
    const generator = requireGenerator("./changelog.cjs")
    const githubInfo = createRequire(fs.realpathSync(requireGenerator.resolve("changesets-changelog-clean")))("@changesets/get-github-info")
    const commit = "abcdef0123456789abcdef0123456789abcdef01"
    const commitLink = `[\`abcdef0\`](https://github.com/owner/repo/commit/${commit})`
    const getInfo = vi.spyOn(githubInfo, "getInfo")
    try {
      // a user with a PR, and an app without one
      getInfo.mockResolvedValueOnce({
        user: "alice",
        pull: 11,
        links: { commit: "", pull: "[#11](https://github.com/owner/repo/pull/11)", user: "[@alice](https://github.com/alice)" },
      })
      const line = await generator.getReleaseLine({ id: "a", summary: "feat: a feature\n\nMore about it.\n\n  - nested", releases: [], commit }, "minor", { repo: "owner/repo" })
      expect(line).toBe(`- Feat: a feature _[\`#11\`](https://github.com/owner/repo/pull/11) ${commitLink}_\n\n  More about it.\n\n    - nested`)

      getInfo.mockResolvedValueOnce({ user: "renovate", pull: null, links: { commit: "", pull: null, user: "[@renovate](https://github.com/apps/renovate)" } })
      expect(await generator.getReleaseLine({ id: "b", summary: "fix: deps", releases: [], commit }, "patch", { repo: "owner/repo" })).toBe(`- Fix: deps _${commitLink}_`)
      expect(getInfo).toHaveBeenCalledTimes(2)
    } finally {
      getInfo.mockRestore()
    }
  })
})
