import { LinuxTargetHelper } from "app-builder-lib/src/targets/linux/LinuxTargetHelper"
import { log } from "builder-util"
import { promises as fs } from "fs"
import * as path from "path"
import { afterEach, describe, expect, test, vi } from "vitest"

const srcRoot = path.join(__dirname, "..", "..", "..", "packages", "app-builder-lib", "src")

/**
 * Three v27 Linux behaviour changes that produced no signal: an EJS tag shipped verbatim inside the
 * package, a renamed installed `.desktop` file, and desktop field codes reaching the app literally.
 */

describe("Linux maintainer-script EJS templates", () => {
  // Mirrors assertNoLegacyEjsTemplate in FpmTarget.ts.
  const LEGACY_EJS_TAG = /<%[-=]?\s*([\w.]+)\s*%>/

  test.each([
    ["<%= executable %>", "executable"],
    ["<%- productFilename %>", "productFilename"],
    ["<% name %>", "name"],
    ["chmod 4755 '/opt/<%= productFilename %>/chrome-sandbox'", "productFilename"],
  ])("%s is detected as a legacy tag", (template, expectedName) => {
    const match = LEGACY_EJS_TAG.exec(template)
    expect(match).not.toBeNull()
    expect(match![1]).toBe(expectedName)
  })

  test.each([
    "chmod 4755 '/opt/${productFilename}/chrome-sandbox'",
    "ln -sf '/opt/${productFilename}/${executable}' '/usr/bin/${executable}'",
    "# a comment mentioning 100% of the time",
    "awk '{print $1}' file",
  ])("the v27 shell-style form is not flagged: %s", template => {
    expect(LEGACY_EJS_TAG.exec(template)).toBeNull()
  })

  test("FpmTarget fails the build rather than shipping the tag", async () => {
    const source = await fs.readFile(path.join(srcRoot, "targets", "linux", "FpmTarget.ts"), "utf8")
    expect(source).toContain("assertNoLegacyEjsTemplate")
    expect(source).toContain("InvalidConfigurationError")
    // Must run on the raw template, before the ${var} substitution that would not match an EJS tag.
    expect(source.indexOf("assertNoLegacyEjsTemplate(templatePath, template)")).toBeLessThan(source.indexOf("template.replace("))
  })
})

describe("linux.executableArgs desktop field codes", () => {
  const DESKTOP_FIELD_CODE = /^%[a-zA-Z]$/

  test.each(["%F", "%f", "%U", "%u", "%i", "%c", "%k"])("%s is recognised as a field code", code => {
    expect(DESKTOP_FIELD_CODE.test(code)).toBe(true)
  })

  test.each(["--no-sandbox", "--ozone-platform=wayland", "%", "%FF", "100%", "--flag=%F"])("%s is not a bare field code", arg => {
    expect(DESKTOP_FIELD_CODE.test(arg)).toBe(false)
  })

  test("LinuxPackager warns from its constructor", async () => {
    const source = await fs.readFile(path.join(srcRoot, "linuxPackager.ts"), "utf8")
    expect(source).toContain("warnAboutDesktopFieldCodes")
    expect(source).toContain("linux-launcher-entrypoint")
  })
})

describe("installed .desktop filename", () => {
  const helperFor = (desktopName: string | undefined) => new LinuxTargetHelper({ metadata: { desktopName }, executableName: "my-app" } as any)
  const spyWarn = () => vi.spyOn(log, "warn").mockImplementation(() => undefined)
  afterEach(() => vi.restoreAllMocks())

  test("LinuxTargetHelper warns once per helper when the name changes from the v26 default", () => {
    const warn = spyWarn()
    const helper = helperFor("com.example.MyApp")
    expect(helper.getDesktopFileName()).toBe("com.example.MyApp")
    expect(helper.getDesktopFileName()).toBe("com.example.MyApp")
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0][0]).toEqual({ desktopName: "com.example.MyApp", previousFileName: "my-app.desktop", fileName: "com.example.MyApp.desktop" })
    expect(String(warn.mock.calls[0][1])).toContain("linuxsyncdesktopname-always-synced")

    // another build (helper) announces it again
    helperFor("com.example.MyApp").getDesktopFileName()
    expect(warn).toHaveBeenCalledTimes(2)
  })

  test("LinuxTargetHelper stays quiet when desktopName matches the v26 default", () => {
    const warn = spyWarn()
    expect(helperFor("my-app.desktop").getDesktopFileName()).toBe("my-app")
    expect(warn).not.toHaveBeenCalled()
  })

  test("a missing desktopName is reported once per helper, however often it is resolved", () => {
    const warn = spyWarn()
    const helper = helperFor(undefined)
    expect(helper.getDesktopFileName()).toBe("my-app")
    expect(helper.getDesktopFileName("fallback")).toBe("fallback")
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0][0]).toMatchObject({ reason: "desktopName is not set in package.json" })
  })
})
