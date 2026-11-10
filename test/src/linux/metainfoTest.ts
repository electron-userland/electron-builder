import { log } from "builder-util"
import { LinuxMetainfoConfiguration } from "app-builder-lib/src/options/linuxOptions"
import { fpmFormatUsesMetainfo, MetainfoPackager, normalizeMetainfoOption, prepareMetainfoFile, validateMetainfoFile } from "app-builder-lib/src/targets/linux/metainfo"
import { mkdtemp, rm, writeFile } from "fs/promises"
import { tmpdir } from "os"
import * as path from "path"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, MockInstance, test, vi } from "vitest"

const APP_ID = "com.example.MyApp"
const DESKTOP_ID = "com.example.MyApp.desktop"

interface MetainfoXmlOptions {
  rootName?: string
  type?: string | null
  id?: string | null
  name?: string | null
  summary?: string | null
  metadataLicense?: string | null
  description?: string | null
  launchable?: string | null
}

function metainfoXml({
  rootName = "component",
  type = "desktop-application",
  id = APP_ID,
  name = "My App",
  summary = "Does example things",
  metadataLicense = "CC0-1.0",
  description = "<description><p>A longer description of the application.</p></description>",
  launchable = `<launchable type="desktop-id">${DESKTOP_ID}</launchable>`,
}: MetainfoXmlOptions = {}): string {
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
    const file = await writeFixture(metainfoXml(overrides))
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

describe("normalizeMetainfoOption", () => {
  test("string and object forms", () => {
    expect(normalizeMetainfoOption(null)).toBeNull()
    expect(normalizeMetainfoOption(undefined)).toBeNull()
    expect(normalizeMetainfoOption("a.metainfo.xml")).toEqual({ file: "a.metainfo.xml", validate: true })
    expect(normalizeMetainfoOption({ file: "a.metainfo.xml" })).toEqual({ file: "a.metainfo.xml", validate: true })
    expect(normalizeMetainfoOption({ file: "a.metainfo.xml", validate: false })).toEqual({ file: "a.metainfo.xml", validate: false })
  })

  // what deepAssign produces for `linux.metainfo: "a.xml"` + `appImage.metainfo: { validate: false }`: the object replaces the string
  test("object without file is rejected", () => {
    expect(() => normalizeMetainfoOption({ validate: false } as any)).toThrowError(/metainfo.file is required/)
  })

  test("blank string is rejected with a configuration error, not a TypeError", () => {
    for (const value of ["", "   "]) {
      expect(() => normalizeMetainfoOption(value)).toThrowError(/metainfo must name a file when it is a string/)
    }
  })
})

describe("fpmFormatUsesMetainfo", () => {
  test.each(["deb", "rpm", "pacman", "apk"])("%s stages the file", format => {
    expect(fpmFormatUsesMetainfo(format)).toBe(true)
  })

  test.each(["freebsd", "p5p", "sh"])("%s does not", format => {
    expect(fpmFormatUsesMetainfo(format)).toBe(false)
  })
})

describe("prepareMetainfoFile", () => {
  // stands in for PlatformPackager.getResource, which also looks in the build resources and throws when nothing is found
  const fakePackager = () => ({ getResource: vi.fn(async (p: string | null | undefined) => path.resolve(projectDir, p!)) })
  const prepare = (metainfo: string | LinuxMetainfoConfiguration, packager: MetainfoPackager = fakePackager(), expectedDesktopId = DESKTOP_ID, appId = APP_ID) =>
    prepareMetainfoFile({ packager, metainfo, appId, expectedDesktopId })

  test("resolves the configured path through the packager", async () => {
    const file = await writeFixture(metainfoXml(), "resolved.metainfo.xml")
    const packager = fakePackager()
    await prepare({ file: "resolved.metainfo.xml" }, packager)
    expect(packager.getResource).toHaveBeenCalledWith("resolved.metainfo.xml")
    expect((await prepare("resolved.metainfo.xml", packager)).file).toBe(file)
  })

  test("normalizes a .metainfo.xml basename that differs from the component id", async () => {
    const file = await writeFixture(metainfoXml(), "myapp.metainfo.xml")
    const staged = await prepare(path.basename(file))
    expect(staged).toEqual({ file, installBasename: "com.example.MyApp.metainfo.xml" })
  })

  // the flatpak target does not use installBasename: it always installs the file as <flatpak id>.metainfo.xml, the only name
  // flatpak-builder composes AppStream data from (see flatpakBundleTest.ts for the related flatpak-builder version gate)
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

  test("invalid file fails the build", async () => {
    const file = await writeFixture(`<component type="web-application"><id>x</id></component>`, "invalid.metainfo.xml")
    await expect(prepare(path.basename(file))).rejects.toThrowError(/Invalid AppStream metainfo file.*validate: false/s)
  })

  test("validate: false skips the validator but still stages", async () => {
    // would hard-fail validation on several counts (wrong type, missing required elements)
    const file = await writeFixture(`<component type="web-application"><id>x.y</id></component>`, "broken.appdata.xml")
    const staged = await prepare({ file: path.basename(file), validate: false })
    expect(staged).toEqual({ file, installBasename: "broken.appdata.xml" })
    expect(warn).not.toHaveBeenCalled()
  })

  test("with validation disabled the component id is still read for the installed name", async () => {
    const file = await writeFixture(metainfoXml({ id: "org.other.Thing" }), "some-name.xml")
    const staged = await prepare({ file: path.basename(file), validate: false })
    expect(staged.installBasename).toBe("org.other.Thing.metainfo.xml")
    expect(warn).not.toHaveBeenCalled()
  })

  test("with validation disabled and an unparseable file, falls back to appId for the installed name", async () => {
    const file = await writeFixture("not xml at all <<<", "some-other-name.xml")
    const staged = await prepare({ file: path.basename(file), validate: false })
    expect(staged.installBasename).toBe(`${APP_ID}.metainfo.xml`)
  })

  test("component id producing a path-escaping file name is rejected", async () => {
    const file = await writeFixture(metainfoXml({ id: "../../evil.id" }), "traversal.xml")
    await expect(prepare({ file: path.basename(file), validate: false })).rejects.toThrowError(/invalid file name/)
  })

  test("absolute metainfo path is used as-is", async () => {
    const file = await writeFixture(metainfoXml(), "abs.metainfo.xml")
    const staged = await prepare(file)
    expect(staged.file).toBe(file)
  })

  test("warnings are logged once per packager across targets and archs", async () => {
    const file = await writeFixture(metainfoXml({ id: "myapp", launchable: null }), "repeated.xml")
    const packager = fakePackager()
    // e.g. deb x64, deb arm64 and rpm x64: same app id and .desktop name
    for (let i = 0; i < 3; i++) {
      await prepare(path.basename(file), packager)
    }
    const count = (re: RegExp) => warnMessages().filter(it => re.test(it)).length
    expect(count(/reverse-DNS identifier/)).toBe(1)
    expect(count(/differs from the configured appId/)).toBe(1)
    expect(count(/no <launchable type="desktop-id">/)).toBe(1)

    // a target with a different .desktop name (e.g. flatpak) gets its own launchable warning
    await prepare(path.basename(file), packager, "other.desktop")
    expect(count(/no <launchable type="desktop-id">/)).toBe(2)
    expect(count(/reverse-DNS identifier/)).toBe(1)

    // another packager (another build) warns again
    await prepare(path.basename(file), fakePackager())
    expect(count(/reverse-DNS identifier/)).toBe(2)
  })

  test("logs one staged info line per packager and file", async () => {
    const info = vi.spyOn(log, "info").mockImplementation(() => undefined)
    try {
      const file = await writeFixture(metainfoXml(), "staged-log.metainfo.xml")
      const packager = fakePackager()
      // e.g. deb x64, deb arm64 and rpm x64 of one build
      for (let i = 0; i < 3; i++) {
        await prepare(path.basename(file), packager)
      }
      const staged = info.mock.calls.filter(call => call[1] === "metainfo staged")
      expect(staged).toHaveLength(1)
      expect(staged[0][0]).toMatchObject({ file: "staged-log.metainfo.xml", validated: "yes" })

      // another packager (another build) logs again
      await prepare(path.basename(file), fakePackager())
      expect(info.mock.calls.filter(call => call[1] === "metainfo staged")).toHaveLength(2)
    } finally {
      info.mockRestore()
    }
  })

  test("the staged info line says validated: no and names no appstreamcli when validation is disabled", async () => {
    const info = vi.spyOn(log, "info").mockImplementation(() => undefined)
    try {
      const file = await writeFixture(metainfoXml(), "staged-log-unvalidated.metainfo.xml")
      await prepare({ file: path.basename(file), validate: false })
      const staged = info.mock.calls.filter(call => call[1] === "metainfo staged")
      expect(staged).toHaveLength(1)
      expect(staged[0][0]).toEqual({ file: "staged-log-unvalidated.metainfo.xml", validated: "no" })
    } finally {
      info.mockRestore()
    }
  })

  test("launchable matches when any desktop-id launchable is the installed .desktop file", async () => {
    const file = await writeFixture(
      metainfoXml({ launchable: `<launchable type="desktop-id">legacy.desktop</launchable><launchable type="desktop-id">${DESKTOP_ID}</launchable>` }),
      "two-launchables.xml"
    )
    await prepare(path.basename(file))
    expect(warn).not.toHaveBeenCalled()
  })
})
