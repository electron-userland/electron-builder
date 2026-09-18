import { log } from "builder-util"
import { prepareMetainfoFile, validateMetainfoFile } from "app-builder-lib/src/targets/linux/metainfo"
import { mkdtemp, rm, writeFile } from "fs/promises"
import { tmpdir } from "os"
import * as path from "path"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, MockInstance, test, vi } from "vitest"

const APP_ID = "com.example.MyApp"
const DESKTOP_ID = "com.example.MyApp.desktop"

function metainfoXml({
  rootName = "component",
  type = "desktop-application" as string | null,
  id = APP_ID as string | null,
  name = "My App" as string | null,
  summary = "Does example things" as string | null,
  metadataLicense = "CC0-1.0" as string | null,
  description = "<description><p>A longer description of the application.</p></description>" as string | null,
  launchable = `<launchable type="desktop-id">${DESKTOP_ID}</launchable>` as string | null,
} = {}): string {
  const child = (tag: string, value: string | null) => (value == null ? "" : `<${tag}>${value}</${tag}>`)
  return `<?xml version="1.0" encoding="UTF-8"?>
<${rootName}${type == null ? "" : ` type="${type}"`}>
  ${child("id", id)}
  ${child("name", name)}
  ${child("summary", summary)}
  ${child("metadata_license", metadataLicense)}
  ${description ?? ""}
  ${launchable ?? ""}
</${rootName}>`
}

let projectDir: string
let fileCounter = 0

async function writeFixture(content: string, basename?: string): Promise<string> {
  const file = path.join(projectDir, basename ?? `fixture-${fileCounter++}.metainfo.xml`)
  await writeFile(file, content)
  return file
}

beforeAll(async () => {
  projectDir = await mkdtemp(path.join(tmpdir(), "eb-metainfo-test-"))
})

afterAll(async () => {
  await rm(projectDir, { recursive: true, force: true })
})

let warn: MockInstance<typeof log.warn>

beforeEach(() => {
  warn = vi.spyOn(log, "warn").mockImplementation(() => log)
})

afterEach(() => {
  warn.mockRestore()
})

const warnMessages = () => warn.mock.calls.map(call => String(call[1]))

describe("validateMetainfoFile", () => {
  test("valid file passes without warnings and returns the component id", async () => {
    const file = await writeFixture(metainfoXml())
    await expect(validateMetainfoFile(file, APP_ID, DESKTOP_ID)).resolves.toBe(APP_ID)
    expect(warn).not.toHaveBeenCalled()
  })

  test("legacy type alias `desktop` is accepted", async () => {
    const file = await writeFixture(metainfoXml({ type: "desktop" }))
    await expect(validateMetainfoFile(file, APP_ID, DESKTOP_ID)).resolves.toBe(APP_ID)
    expect(warn).not.toHaveBeenCalled()
  })

  test("missing file hard-fails", async () => {
    await expect(validateMetainfoFile(path.join(projectDir, "does-not-exist.metainfo.xml"), APP_ID, DESKTOP_ID)).rejects.toThrowError(/cannot read metainfo file/)
  })

  test("malformed XML hard-fails", async () => {
    const file = await writeFixture("<component><id>oops</id></wrong>")
    await expect(validateMetainfoFile(file, APP_ID, DESKTOP_ID)).rejects.toThrowError(/not well-formed XML/)
  })

  test("root element other than <component> hard-fails", async () => {
    const file = await writeFixture(metainfoXml({ rootName: "application" }))
    await expect(validateMetainfoFile(file, APP_ID, DESKTOP_ID)).rejects.toThrowError(/root element must be <component>, but found <application>/)
  })

  test("missing type attribute hard-fails", async () => {
    const file = await writeFixture(metainfoXml({ type: null }))
    await expect(validateMetainfoFile(file, APP_ID, DESKTOP_ID)).rejects.toThrowError(/"type" attribute must be "desktop-application".*no type attribute/)
  })

  test("wrong type attribute hard-fails", async () => {
    const file = await writeFixture(metainfoXml({ type: "console-application" }))
    await expect(validateMetainfoFile(file, APP_ID, DESKTOP_ID)).rejects.toThrowError(/"type" attribute must be "desktop-application".*"console-application"/)
  })

  test.each([
    ["id", { id: null }],
    ["name", { name: null }],
    ["summary", { summary: null }],
    ["metadata_license", { metadataLicense: null }],
    ["description", { description: null }],
  ])("missing required element <%s> hard-fails", async (elementName, overrides) => {
    const file = await writeFixture(metainfoXml(overrides as any))
    await expect(validateMetainfoFile(file, APP_ID, DESKTOP_ID)).rejects.toThrowError(new RegExp(`required element <${elementName}> is missing or empty`))
  })

  test("empty required element hard-fails", async () => {
    const file = await writeFixture(metainfoXml({ summary: "   " }))
    await expect(validateMetainfoFile(file, APP_ID, DESKTOP_ID)).rejects.toThrowError(/required element <summary> is missing or empty/)
  })

  test("description containing only child elements counts as non-empty", async () => {
    const file = await writeFixture(metainfoXml({ description: "<description><p>text</p><p>more</p></description>" }))
    await expect(validateMetainfoFile(file, APP_ID, DESKTOP_ID)).resolves.toBe(APP_ID)
  })

  test("errors are accumulated into a single failure", async () => {
    const file = await writeFixture(metainfoXml({ type: "web-application", name: null, summary: null }))
    const error = await validateMetainfoFile(file, APP_ID, DESKTOP_ID).catch((e: Error) => e)
    expect(error).toBeInstanceOf(Error)
    const message = (error as Error).message
    expect(message).toMatch(/"type" attribute must be "desktop-application"/)
    expect(message).toMatch(/required element <name> is missing or empty/)
    expect(message).toMatch(/required element <summary> is missing or empty/)
  })

  test("warns when the component id is not reverse-DNS-shaped", async () => {
    const file = await writeFixture(metainfoXml({ id: "myapp" }))
    await validateMetainfoFile(file, "myapp", DESKTOP_ID)
    expect(warnMessages()).toContainEqual(expect.stringMatching(/reverse-DNS identifier/))
  })

  test("warns when the component id differs from appId", async () => {
    const file = await writeFixture(metainfoXml({ id: "com.example.OtherApp" }))
    await expect(validateMetainfoFile(file, APP_ID, DESKTOP_ID)).resolves.toBe("com.example.OtherApp")
    expect(warnMessages()).toContainEqual(expect.stringMatching(/differs from the configured appId/))
  })

  test('warns when <launchable type="desktop-id"> is missing', async () => {
    const file = await writeFixture(metainfoXml({ launchable: null }))
    await validateMetainfoFile(file, APP_ID, DESKTOP_ID)
    expect(warnMessages()).toContainEqual(expect.stringMatching(/no <launchable type="desktop-id">/))
  })

  test("warns when the launchable does not match the installed .desktop file", async () => {
    const file = await writeFixture(metainfoXml({ launchable: `<launchable type="desktop-id">wrong.desktop</launchable>` }))
    await validateMetainfoFile(file, APP_ID, DESKTOP_ID)
    expect(warnMessages()).toContainEqual(expect.stringMatching(/does not match the \.desktop file installed by this target/))
  })
})

describe("prepareMetainfoFile", () => {
  const prepare = (metainfo: string, disableValidation = false) => prepareMetainfoFile({ projectDir, metainfo, appId: APP_ID, expectedDesktopId: DESKTOP_ID, disableValidation })

  test("keeps a basename ending in .metainfo.xml", async () => {
    const file = await writeFixture(metainfoXml(), "com.example.MyApp.metainfo.xml")
    const staged = await prepare(path.basename(file))
    expect(staged).toEqual({ file, installBasename: "com.example.MyApp.metainfo.xml" })
  })

  test("keeps a basename ending in .appdata.xml (AppImageHub convention) without warning about the choice", async () => {
    const file = await writeFixture(metainfoXml(), "myapp.appdata.xml")
    const staged = await prepare(path.basename(file))
    expect(staged.installBasename).toBe("myapp.appdata.xml")
    expect(warnMessages()).not.toContainEqual(expect.stringMatching(/appdata|basename|file name/))
  })

  test("normalizes any other basename to <component-id>.metainfo.xml", async () => {
    const file = await writeFixture(metainfoXml(), "metainfo-source.xml")
    const staged = await prepare(path.basename(file))
    expect(staged.installBasename).toBe("com.example.MyApp.metainfo.xml")
    expect(staged.file).toBe(file)
  })

  test("disableMetainfoValidation skips the validator but still stages", async () => {
    // would hard-fail validation on several counts (wrong type, missing required elements)
    const file = await writeFixture(`<component type="web-application"><id>x</id></component>`, "broken.metainfo.xml")
    const staged = await prepare(path.basename(file), true)
    expect(staged).toEqual({ file, installBasename: "broken.metainfo.xml" })
    expect(warn).not.toHaveBeenCalled()
  })

  test("with validation disabled the component id is still read for the installed name", async () => {
    const file = await writeFixture(metainfoXml({ id: "org.other.Thing" }), "some-name.xml")
    const staged = await prepare(path.basename(file), true)
    expect(staged.installBasename).toBe("org.other.Thing.metainfo.xml")
    expect(warn).not.toHaveBeenCalled()
  })

  test("with validation disabled and an unparseable file, falls back to appId for the installed name", async () => {
    const file = await writeFixture("not xml at all <<<", "some-other-name.xml")
    const staged = await prepare(path.basename(file), true)
    expect(staged.installBasename).toBe(`${APP_ID}.metainfo.xml`)
  })

  test("component id producing a path-escaping file name is rejected", async () => {
    const file = await writeFixture(metainfoXml({ id: "../../evil.id" }), "traversal.xml")
    await expect(prepare(path.basename(file), true)).rejects.toThrowError(/invalid file name/)
  })

  test("absolute metainfo path is used as-is", async () => {
    const file = await writeFixture(metainfoXml(), "abs.metainfo.xml")
    const staged = await prepare(file)
    expect(staged.file).toBe(file)
  })
})
