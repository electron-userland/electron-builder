import { log } from "builder-util"
import {
  BROWSER_SUPPORT_INTERFACE,
  CORE24_DEFAULT_APP_PLUGS,
  CORE24_NO_ALLOW_SANDBOX_DOCS,
  core24ContentPlugs,
  findAllowSandboxPlugs,
  isBrowserSandboxAllowed,
  resetSnapPlugNoticesForTests,
  resolveCore24Plugs,
  warnAboutAllowSandboxPlugs,
  warnAboutCore24DefaultPlugsExpansion,
  warnAboutCore24NoSandboxDefault,
} from "app-builder-lib/src/targets/linux/snap/snapPlugs"
import { afterEach, beforeEach, describe, vi } from "vitest"

// Pure unit tests for core24 plug resolution. Full snap build flows are exercised by snapcraftTest.ts.

const CONTENT_PLUGS = ["gtk-3-themes", "icon-themes", "sound-themes", "gnome-46-2404", "gpu-2404"]

describe("core24 plug resolution", { concurrent: false }, () => {
  describe("generated defaults (plugs unset)", () => {
    test("strict builds request plain browser-support next to the content plugs", ({ expect }) => {
      const result = resolveCore24Plugs(undefined, "strict")
      expect(result.source).toBe("generated")
      expect(result.app).toEqual([...CORE24_DEFAULT_APP_PLUGS, BROWSER_SUPPORT_INTERFACE])
      expect(Object.keys(result.root!).sort()).toEqual([...CONTENT_PLUGS, BROWSER_SUPPORT_INTERFACE].sort())
      expect(result.root![BROWSER_SUPPORT_INTERFACE]).toEqual({ interface: BROWSER_SUPPORT_INTERFACE })
    })

    test.for(["strict", "gnome-extension", "host"] as const)("never requests allow-sandbox (%s)", (flavor, { expect }) => {
      const result = resolveCore24Plugs(null, flavor)
      expect(isBrowserSandboxAllowed(result.root)).toBe(false)
      expect(findAllowSandboxPlugs(result.root)).toEqual([])
      expect(result.app).toContain(BROWSER_SUPPORT_INTERFACE)
    })

    test("gnome extension builds leave the desktop and content plugs to the extension", ({ expect }) => {
      expect(resolveCore24Plugs(undefined, "gnome-extension")).toMatchObject({
        root: { [BROWSER_SUPPORT_INTERFACE]: { interface: BROWSER_SUPPORT_INTERFACE } },
        app: [BROWSER_SUPPORT_INTERFACE],
      })
    })

    test("host builds declare the app-level plugs but no content plugs", ({ expect }) => {
      const result = resolveCore24Plugs(undefined, "host")
      expect(result.app).toEqual([...CORE24_DEFAULT_APP_PLUGS, BROWSER_SUPPORT_INTERFACE])
      expect(Object.keys(result.root!)).toEqual([BROWSER_SUPPORT_INTERFACE])
    })

    test("classic confinement declares no plugs", ({ expect }) => {
      expect(resolveCore24Plugs(undefined, "classic")).toMatchObject({ root: undefined, app: undefined })
    })
  })

  describe('"default" merges the user entries into the full default set', () => {
    test("extra plugs are appended to the default set", ({ expect }) => {
      const result = resolveCore24Plugs(["default", "camera"], "strict")
      expect(result.source).toBe("merged")
      expect(result.app).toEqual([...CORE24_DEFAULT_APP_PLUGS, BROWSER_SUPPORT_INTERFACE, "camera"])
      // the merged set keeps every default root plug — the same ones the unset case declares
      expect(result.root).toEqual(resolveCore24Plugs(undefined, "strict").root)
      expect(result.addedByDefaultExpansion.sort()).toEqual([...CONTENT_PLUGS, BROWSER_SUPPORT_INTERFACE].sort())
    })

    test("entries are deduplicated by plug name and keep the position of the default keyword", ({ expect }) => {
      const result = resolveCore24Plugs(["camera", "default", "network", "camera", "browser-support"], "host")
      expect(result.app).toEqual(["camera", ...CORE24_DEFAULT_APP_PLUGS, BROWSER_SUPPORT_INTERFACE])
    })

    test("with the gnome extension the app-level defaults are still included", ({ expect }) => {
      const result = resolveCore24Plugs(["default", "camera"], "gnome-extension")
      expect(result.app).toEqual([...CORE24_DEFAULT_APP_PLUGS, BROWSER_SUPPORT_INTERFACE, "camera"])
      expect(Object.keys(result.root!)).toEqual([BROWSER_SUPPORT_INTERFACE])
      expect(result.addedByDefaultExpansion).toEqual([BROWSER_SUPPORT_INTERFACE])
    })

    test("a descriptor named like a default plug overrides that plug's attributes", ({ expect }) => {
      const result = resolveCore24Plugs(["default", { "gpu-2404": { "default-provider": "mesa-custom" } }, { home: { read: "all" } }], "strict")
      expect(result.root!["gpu-2404"]).toEqual({ ...core24ContentPlugs()["gpu-2404"], "default-provider": "mesa-custom" })
      expect(result.root!.home).toEqual({ read: "all" })
      expect(result.app!.filter(it => it === "gpu-2404" || it === "home")).toEqual(["home", "gpu-2404"])
      // other defaults are untouched
      expect(result.root!["gtk-3-themes"]).toEqual(core24ContentPlugs()["gtk-3-themes"])
    })

    test("the override applies even when the descriptor comes before the default keyword", ({ expect }) => {
      const result = resolveCore24Plugs([{ "browser-support": { "allow-sandbox": true } }, "default"], "gnome-extension")
      expect(result.root![BROWSER_SUPPORT_INTERFACE]).toEqual({ interface: BROWSER_SUPPORT_INTERFACE, "allow-sandbox": true })
      expect(isBrowserSandboxAllowed(result.root)).toBe(true)
      expect(result.app).toEqual([BROWSER_SUPPORT_INTERFACE, ...CORE24_DEFAULT_APP_PLUGS])
    })

    test("a null descriptor resets a default plug to the snapd defaults", ({ expect }) => {
      const result = resolveCore24Plugs(["default", { "gpu-2404": null }], "strict")
      expect(result.root!["gpu-2404"]).toBeNull()
    })

    test("classic confinement keeps the previous expansion", ({ expect }) => {
      const result = resolveCore24Plugs(["default", "camera"], "classic")
      expect(result.app).toEqual([...CORE24_DEFAULT_APP_PLUGS, "camera"])
      expect(result.root).toBeUndefined()
      expect(result.addedByDefaultExpansion).toEqual([])
    })

    test("invalid plug names are rejected", ({ expect }) => {
      expect(() => resolveCore24Plugs(["default", JSON.parse('{"__proto__": {"interface": "x"}}')], "strict")).toThrow("Invalid plug/slot name: __proto__")
      expect(() => resolveCore24Plugs(["default", "constructor"], "strict")).toThrow("Invalid plug/slot name: constructor")
    })
  })

  describe("without default the user list replaces the defaults", () => {
    test("string and descriptor entries", ({ expect }) => {
      const result = resolveCore24Plugs(["network", { "browser-sandbox": { interface: "browser-support" } }], "strict")
      expect(result).toEqual({
        root: { "browser-sandbox": { interface: "browser-support" } },
        app: ["network", "browser-sandbox"],
        source: "explicit",
        addedByDefaultExpansion: [],
      })
      expect(isBrowserSandboxAllowed(result.root)).toBe(false)
    })

    test("single descriptor object", ({ expect }) => {
      const result = resolveCore24Plugs({ "browser-sandbox": { interface: "browser-support", "allow-sandbox": true }, other: null }, "strict")
      expect(result.app).toEqual(["browser-sandbox", "other"])
      expect(isBrowserSandboxAllowed(result.root)).toBe(true)
    })

    test("an empty list declares no plugs", ({ expect }) => {
      expect(resolveCore24Plugs([], "strict")).toMatchObject({ root: undefined, app: undefined, source: "explicit" })
    })
  })

  describe("findAllowSandboxPlugs", () => {
    test("matches browser-support by interface, or by name when no interface is set", ({ expect }) => {
      expect(
        findAllowSandboxPlugs({
          "browser-sandbox": { interface: "browser-support", "allow-sandbox": true },
          "browser-support": { "allow-sandbox": true },
          plain: { interface: "browser-support" },
          other: { interface: "camera", "allow-sandbox": true },
          empty: null,
        })
      ).toEqual(["browser-sandbox", "browser-support"])
    })
  })
})

describe("core24 plug notices", { concurrent: false }, () => {
  let warn: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    resetSnapPlugNoticesForTests()
    warn = vi.spyOn(log, "warn").mockImplementation(() => undefined)
  })

  afterEach(() => {
    warn.mockRestore()
  })

  test("warns that the Snap Store reserves an explicitly configured allow-sandbox", ({ expect }) => {
    const { root } = resolveCore24Plugs([{ "browser-sandbox": { interface: "browser-support", "allow-sandbox": true } }, "network"], "strict")
    warnAboutAllowSandboxPlugs(root, "snapcraft.core24.plugs")
    warnAboutAllowSandboxPlugs(root, "snapcraft.core24.plugs")
    expect(warn).toHaveBeenCalledTimes(1)
    const [fields, message] = warn.mock.calls[0] as [Record<string, string>, string]
    expect(fields.plugs).toBe("browser-sandbox")
    expect(message).toContain("Snap Store reserves allow-sandbox for vetted publishers")
    expect(message).toContain(CORE24_NO_ALLOW_SANDBOX_DOCS)
    // the configuration itself is left as is
    expect(root!["browser-sandbox"]["allow-sandbox"]).toBe(true)
  })

  test("does not warn about allow-sandbox for the generated defaults", ({ expect }) => {
    for (const flavor of ["strict", "gnome-extension", "host", "classic"] as const) {
      warnAboutAllowSandboxPlugs(resolveCore24Plugs(undefined, flavor).root, "snapcraft.core24.plugs")
    }
    expect(warn).not.toHaveBeenCalled()
  })

  test("announces the --no-sandbox default once per process", ({ expect }) => {
    warnAboutCore24NoSandboxDefault()
    warnAboutCore24NoSandboxDefault()
    expect(warn).toHaveBeenCalledTimes(1)
    const message = warn.mock.calls[0][1] as string
    expect(message).toContain("--no-sandbox")
    expect(message).toContain("https://www.electron.build/docs/migration/v27-breaking-changes#")
  })

  test('announces the plugs that the "default" expansion now adds', ({ expect }) => {
    warnAboutCore24DefaultPlugsExpansion([])
    expect(warn).not.toHaveBeenCalled()
    warnAboutCore24DefaultPlugsExpansion(resolveCore24Plugs(["default", "camera"], "gnome-extension").addedByDefaultExpansion)
    expect(warn).toHaveBeenCalledTimes(1)
    const [fields, message] = warn.mock.calls[0] as [Record<string, string>, string]
    expect(fields.added).toBe(BROWSER_SUPPORT_INTERFACE)
    expect(message).toContain("https://www.electron.build/docs/migration/v27-breaking-changes#snap-core24-default-in-plugs-merges-the-full-default-set")
  })
})
