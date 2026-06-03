import { afterEach, beforeEach, describe, expect, test } from "vitest"
import { convertVersion, escapeXml, renderNuspecTemplate, buildAdditionalFilesXml } from "electron-builder-squirrel-windows/out/windowsInstaller"
import { mkdir, mkdtemp, rm, writeFile } from "fs/promises"
import { tmpdir } from "os"
import * as path from "path"

describe("convertVersion", () => {
  test.each([
    ["1.0.0", "1.0.0"],
    ["1.2.3", "1.2.3"],
    ["1.0.0-alpha", "1.0.0-alpha"],
    ["1.0.0-alpha.1", "1.0.0-alpha1"],
    ["1.0.0-alpha.beta", "1.0.0-alphabeta"],
    ["1.0.0-rc.1", "1.0.0-rc1"],
    ["2.0.0-beta.2", "2.0.0-beta2"],
    ["1.0.0+build.123", "1.0.0"],
    ["1.0.0-beta+build.1", "1.0.0-beta"],
    ["2.0.0-rc.1+sha.abc123", "2.0.0-rc1"],
    ["10.20.30", "10.20.30"],
  ])("converts %s → %s", (input, expected) => {
    expect(convertVersion(input)).toBe(expected)
  })
})

describe("escapeXml", () => {
  test.each([
    ["Foo & Bar", "Foo &amp; Bar"],
    ["<script>alert(1)</script>", "&lt;script&gt;alert(1)&lt;/script&gt;"],
    ['"double quoted"', "&quot;double quoted&quot;"],
    ["it's fine", "it&apos;s fine"],
    ["normal text", "normal text"],
    ["a & b < c > d", "a &amp; b &lt; c &gt; d"],
    ["", ""],
  ])("escapes %s", (input, expected) => {
    expect(escapeXml(input)).toBe(expected)
  })

  test("escapes all five XML special characters", () => {
    expect(escapeXml(`&<>"'`)).toBe("&amp;&lt;&gt;&quot;&apos;")
  })
})

describe("renderNuspecTemplate", () => {
  test("substitutes a single variable", () => {
    expect(renderNuspecTemplate("<id><%- name %></id>", { name: "MyApp" })).toBe("<id>MyApp</id>")
  })

  test("substitutes multiple variables", () => {
    const template = "<id><%- name %></id><version><%- version %></version>"
    expect(renderNuspecTemplate(template, { name: "App", version: "1.2.3" })).toBe("<id>App</id><version>1.2.3</version>")
  })

  test("leaves unknown placeholders untouched", () => {
    expect(renderNuspecTemplate("<%- unknown %>", {})).toBe("<%- unknown %>")
  })

  test("handles empty string values", () => {
    expect(renderNuspecTemplate("<a><%- val %></a>", { val: "" })).toBe("<a></a>")
  })

  test("substitutes the same key multiple times", () => {
    const template = "<%- x %> and <%- x %>"
    expect(renderNuspecTemplate(template, { x: "hello" })).toBe("hello and hello")
  })

  test("inserts pre-escaped XML values verbatim", () => {
    const template = "<desc><%- description %></desc>"
    const result = renderNuspecTemplate(template, { description: "A &amp; B" })
    expect(result).toBe("<desc>A &amp; B</desc>")
  })

  test("inserts additionalFilesXml block without double-escaping", () => {
    const extra = `    <file src="swiftshader\\**" target="lib\\net45\\swiftshader" />`
    const template = "<%- additionalFilesXml %>"
    expect(renderNuspecTemplate(template, { additionalFilesXml: extra })).toBe(extra)
  })
})

describe("buildAdditionalFilesXml", () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(tmpdir(), "eb-installer-test-"))
  })

  afterEach(() => rm(tmpDir, { recursive: true, force: true }).catch(() => {}))

  test("returns empty string when no optional GPU files present", async () => {
    const result = await buildAdditionalFilesXml(tmpDir)
    expect(result).toBe("")
  })

  test("includes swiftshader entry when directory present", async () => {
    await mkdir(path.join(tmpDir, "swiftshader"), { recursive: true })
    const result = await buildAdditionalFilesXml(tmpDir)
    expect(result).toContain("swiftshader")
    expect(result).toContain("<file")
  })

  test("includes vk_swiftshader_icd.json entry when file present", async () => {
    await writeFile(path.join(tmpDir, "vk_swiftshader_icd.json"), "{}")
    const result = await buildAdditionalFilesXml(tmpDir)
    expect(result).toContain("vk_swiftshader_icd.json")
    expect(result).toContain("<file")
  })

  test("includes both entries when both present", async () => {
    await mkdir(path.join(tmpDir, "swiftshader"), { recursive: true })
    await writeFile(path.join(tmpDir, "vk_swiftshader_icd.json"), "{}")
    const result = await buildAdditionalFilesXml(tmpDir)
    expect(result).toContain("swiftshader")
    expect(result).toContain("vk_swiftshader_icd.json")
    const lines = result.split("\n").filter((l: string) => l.trim())
    expect(lines).toHaveLength(2)
  })

  test("does not include unrelated files", async () => {
    await writeFile(path.join(tmpDir, "some-other-file.dll"), "")
    const result = await buildAdditionalFilesXml(tmpDir)
    expect(result).toBe("")
  })
})
