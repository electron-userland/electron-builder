import * as fs from "node:fs"
import * as path from "node:path"
import semver from "semver"
import { annotation, formatMarkdown, formatPlan, orderPackages, parseConfig, warningsOf } from "../../scripts/npm-dist-tags.mjs"

// the parts of scripts/npm-dist-tags.mjs without I/O: what the npm dist-tag workflow (.github/workflows/npm-dist-tag.yml)
// accepts in .github/npm-dist-tags.yml, the order in which packages move and the plan it reads. No git or npm here: the
// script takes the semver package of npm, this is the same package from the registry
const REPO_ROOT = path.resolve(__dirname, "../../")
const FILE = ".github/npm-dist-tags.yml"

const parse = (text: string) => parseConfig(text, FILE, semver)

describe("parseConfig", () => {
  test("the committed file is valid", ({ expect }) => {
    const { entries, errors } = parseConfig(fs.readFileSync(path.join(REPO_ROOT, FILE), "utf8"), FILE, semver)
    expect(errors).toEqual([])
    expect(entries.map(e => e.tag)).toContain("latest")
  })

  test("reads dist-tags, skipping comments and blank lines", ({ expect }) => {
    const { entries, errors } = parse("# comment\n\nlatest: 26.15.3 # trailing comment\r\nbeta: '26.16.0-alpha.1'\nstable: \"25.1.8\"\n")
    expect(errors).toEqual([])
    expect(entries).toEqual([
      { tag: "latest", version: "26.15.3", where: `${FILE}:3` },
      { tag: "beta", version: "26.16.0-alpha.1", where: `${FILE}:4` },
      { tag: "stable", version: "25.1.8", where: `${FILE}:5` },
    ])
  })

  test.for(["next", "v26", "v1"])("refuses %s, which the Release workflow moves", (tag, { expect }) => {
    const { entries, errors } = parse(`latest: 26.15.3\n${tag}: 26.16.0\n`)
    expect(entries.map(e => e.tag)).toEqual(["latest"])
    expect(errors).toEqual([`${FILE}:2: ${tag} is moved by the Release workflow (pr-release.yml) on every release, not by this file`])
  })

  test.for(["x", "X", "x.x", "v1.2", "v1.2.3"])("refuses the semver range %s", (tag, { expect }) => {
    const { entries, errors } = parse(`latest: 26.15.3\n${tag}: 26.16.0\n`)
    expect(entries.map(e => e.tag)).toEqual(["latest"])
    expect(errors).toEqual([`${FILE}:2: npm does not accept ${tag} as a dist-tag: it is a semver range`])
  })

  test.for(["beta", "stable", "latest-v1", "x26", "next-26"])("accepts the dist-tag %s", (tag, { expect }) => {
    const { entries, errors } = parse(`latest: 26.15.3\n${tag}: 26.16.0\n`)
    expect(errors).toEqual([])
    expect(entries.map(e => e.tag)).toEqual(["latest", tag])
  })

  test.for(["1latest", "-latest", "la test", "lat$est", "latest!"])("refuses the dist-tag name %j", (tag, { expect }) => {
    const { entries, errors } = parse(`latest: 26.15.3\n${tag}: 26.16.0\n`)
    expect(entries.map(e => e.tag)).toEqual(["latest"])
    expect(errors).toHaveLength(1)
    expect(errors[0]).toMatch(new RegExp(`^${FILE}:2: `))
  })

  test("refuses a dist-tag listed twice", ({ expect }) => {
    const { entries, errors } = parse("latest: 26.15.3\nlatest: 26.16.0\n")
    expect(entries).toEqual([{ tag: "latest", version: "26.15.3", where: `${FILE}:1` }])
    expect(errors).toEqual([`${FILE}:2: latest is in the file twice`])
  })

  test.for(["26", "26.15", "v26.15.3", "^26.15.3", "26.15.3+build", "26.15.3-", "latest", "26.15.x"])("refuses the version %j", (version, { expect }) => {
    const { entries, errors } = parse(`latest: 26.15.3\nbeta: ${version}\n`)
    expect(entries.map(e => e.tag)).toEqual(["latest"])
    expect(errors).toEqual([`${FILE}:2: beta must name an electron-builder version such as 26.17.0, not ${JSON.stringify(version)}`])
  })

  test.for([
    ["no space after the colon", "latest:26.15.3"],
    ["a mapping", "latest:\n  version: 26.15.3"],
    ["mismatched quotes", "latest: \"26.15.3'"],
    ["two values", "latest: 26.15.3 26.16.0"],
    ["a list", "- latest: 26.15.3"],
  ])("refuses %s", ([, text], { expect }) => {
    const { errors } = parse(`${text}\n`)
    expect(errors.length).toBeGreaterThan(0)
    expect(errors[0]).toMatch(/expected `<dist-tag>: <electron-builder version>`|is not a dist-tag name/)
  })

  test("refuses a file without latest", ({ expect }) => {
    expect(parse("beta: 26.16.0\n").errors).toEqual([`${FILE}: has no latest (what \`npm install electron-builder\` installs)`])
    expect(parse("# nothing\n").errors).toEqual([`${FILE}: has no latest (what \`npm install electron-builder\` installs)`])
  })

  test("reports only the other errors when latest is refused", ({ expect }) => {
    expect(parse("latest: 26\n").errors).toEqual([`${FILE}:1: latest must name an electron-builder version such as 26.17.0, not "26"`])
  })

  test("quotes and truncates what it refuses", ({ expect }) => {
    const { errors } = parse(`latest: 26.15.3\n${"$".repeat(200)}\n`)
    expect(errors).toEqual([`${FILE}:2: expected \`<dist-tag>: <electron-builder version>\`, not ${JSON.stringify("$".repeat(80))}`])
  })
})

describe("orderPackages", () => {
  test("moves electron-builder last, the others by name", ({ expect }) => {
    const packages = ["electron-updater", "electron-builder", "app-builder-lib", "builder-util-runtime", "dmg-builder"].map(name => ({ name, version: "1.0.0" }))
    expect(orderPackages(packages).map(p => p.name)).toEqual(["app-builder-lib", "builder-util-runtime", "dmg-builder", "electron-updater", "electron-builder"])
    // a copy: the input is left as it was
    expect(packages[0].name).toBe("electron-updater")
  })

  test("keeps electron-builder last when it comes first by name", ({ expect }) => {
    const packages = ["electron-builder-squirrel-windows", "electron-builder", "electron-publish"].map(name => ({ name, version: "1.0.0" }))
    expect(orderPackages(packages).map(p => p.name)).toEqual(["electron-builder-squirrel-windows", "electron-publish", "electron-builder"])
  })
})

describe("warningsOf", () => {
  test("warns about a prerelease as latest", ({ expect }) => {
    expect(warningsOf({ tag: "latest", version: "26.16.0-alpha.1" }, "26.15.3", semver)).toEqual([
      "26.16.0-alpha.1 is a prerelease: it becomes what `npm install electron-builder` installs",
    ])
    expect(warningsOf({ tag: "beta", version: "26.16.0-alpha.1" }, "26.15.3", semver)).toEqual([])
  })

  test("warns about a move back", ({ expect }) => {
    expect(warningsOf({ tag: "latest", version: "26.14.0" }, "26.15.3", semver)).toEqual(["latest moves back from electron-builder@26.15.3 to 26.14.0"])
    expect(warningsOf({ tag: "latest", version: "26.15.3" }, "26.15.3", semver)).toEqual([])
    expect(warningsOf({ tag: "latest", version: "26.16.0" }, "26.15.3", semver)).toEqual([])
    // a dist-tag not on npm yet
    expect(warningsOf({ tag: "stable", version: "26.14.0" }, undefined, semver)).toEqual([])
  })
})

describe("plan output", () => {
  const entries = [
    { tag: "latest", version: "26.16.0", where: `${FILE}:1` },
    { tag: "stable", version: "25.1.8", where: `${FILE}:2` },
  ]
  const plan = [
    { tag: "latest", name: "app-builder-lib", version: "26.16.0", before: "26.15.3" },
    { tag: "latest", name: "electron-updater", version: "6.8.0", before: "6.8.0" },
    { tag: "latest", name: "electron-builder", version: "26.16.0", before: "26.15.3" },
    { tag: "stable", name: "app-builder-lib", version: "25.1.8", before: "25.1.8" },
    { tag: "stable", name: "electron-builder", version: "25.1.8", before: "25.1.8" },
  ]

  test("TSV: tag, name, version, current version, one line per package", ({ expect }) => {
    const tsv = formatPlan([...plan, { tag: "stable", name: "electron-publish", version: "25.1.8", before: "" }])
    expect(tsv).toBe(
      [
        "latest\tapp-builder-lib\t26.16.0\t26.15.3",
        "latest\telectron-updater\t6.8.0\t6.8.0",
        "latest\telectron-builder\t26.16.0\t26.15.3",
        "stable\tapp-builder-lib\t25.1.8\t25.1.8",
        "stable\telectron-builder\t25.1.8\t25.1.8",
        // unset on npm: an empty last field, which `read -r tag name version before` reads as ""
        "stable\telectron-publish\t25.1.8\t",
        "",
      ].join("\n")
    )
    expect(formatPlan([])).toBe("")
  })

  test("Markdown summary", ({ expect }) => {
    const markdown = formatMarkdown("npm dist-tags when this is merged", entries, plan, ["latest moves back from electron-builder@26.17.0 to 26.16.0"])
    expect(markdown).toBe(
      [
        "## npm dist-tags when this is merged",
        "",
        "### `latest` → electron-builder@26.16.0",
        "",
        "2 of 3 packages move.",
        "",
        "| Package | `latest` now | `latest` after | |",
        "| --- | --- | --- | --- |",
        "| app-builder-lib | 26.15.3 | 26.16.0 | moves |",
        "| electron-updater | 6.8.0 | 6.8.0 | already set |",
        "| electron-builder | 26.15.3 | 26.16.0 | moves |",
        "",
        "### `stable` → electron-builder@25.1.8",
        "",
        "Every package is already at this release: nothing to change.",
        "",
        "| Package | `stable` now | `stable` after | |",
        "| --- | --- | --- | --- |",
        "| app-builder-lib | 25.1.8 | 25.1.8 | already set |",
        "| electron-builder | 25.1.8 | 25.1.8 | already set |",
        "",
        "> [!WARNING]",
        "> latest moves back from electron-builder@26.17.0 to 26.16.0",
        "",
        "",
      ].join("\n")
    )
  })

  test("Markdown summary shows an unset dist-tag as -", ({ expect }) => {
    const markdown = formatMarkdown("t", [entries[0]], [{ tag: "latest", name: "electron-builder", version: "26.16.0", before: "" }], [])
    expect(markdown).toContain("1 of 1 packages move.")
    expect(markdown).toContain("| electron-builder | - | 26.16.0 | moves |")
    expect(markdown).not.toContain("WARNING")
  })
})

test("annotation escapes what would end the workflow command", ({ expect }) => {
  expect(annotation("error", "100% a\r\nb")).toBe("::error::100%25 a%0D%0Ab")
})
