import { log, removeNullish } from "builder-util"
import {
  BROWSER_SUPPORT_INTERFACE,
  CORE24_DEFAULT_APP_PLUGS,
  CORE24_NO_ALLOW_SANDBOX_DOCS,
  core24ContentPlugs,
  findAllowSandboxPlugs,
  isBrowserSandboxAllowed,
  resolveCore24Plugs,
  SnapPlugsConfig,
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

    test.for(CONTENT_PLUGS)("a null descriptor removes the default content plug %s from both the root and the app plugs", (name, { expect }) => {
      const result = resolveCore24Plugs(["default", { [name]: null }], "strict")
      expect(result.app).not.toContain(name)
      expect(Object.keys(result.root!)).not.toContain(name)
      // the other defaults are untouched
      expect(Object.keys(result.root!).sort()).toEqual([...CONTENT_PLUGS.filter(it => it !== name), BROWSER_SUPPORT_INTERFACE].sort())
      expect(result.app).toEqual([...CORE24_DEFAULT_APP_PLUGS, BROWSER_SUPPORT_INTERFACE])
      expect(result.addedByDefaultExpansion).not.toContain(name)
    })

    test("a null content plug descriptor before the default keyword or next to a plain entry still removes it", ({ expect }) => {
      const result = resolveCore24Plugs(["gpu-2404", { "gpu-2404": null }, "default"], "strict")
      expect(result.app).not.toContain("gpu-2404")
      expect(result.root).not.toHaveProperty("gpu-2404")
    })

    test("a null descriptor resets browser-support to the snapd defaults", ({ expect }) => {
      const result = resolveCore24Plugs(["default", { [BROWSER_SUPPORT_INTERFACE]: null }], "strict")
      // the app keeps referencing the plug; with no root definition snapd uses the interface named like it
      expect(result.app).toContain(BROWSER_SUPPORT_INTERFACE)
      expect(result.root![BROWSER_SUPPORT_INTERFACE]).toBeNull()
      expect(removeNullish(result.root)).not.toHaveProperty(BROWSER_SUPPORT_INTERFACE)
      expect(isBrowserSandboxAllowed(result.root)).toBe(false)
    })

    test("a null descriptor for a plug that is not a default keeps the plain interface reference", ({ expect }) => {
      const result = resolveCore24Plugs(["default", { camera: null }], "strict")
      expect(result.app).toContain("camera")
      expect(removeNullish(result.root)).not.toHaveProperty("camera")
    })

    // The snapcraft.yaml is passed through removeNullish (see SnapCore24), which drops null root definitions.
    // Every app plug must then either have a root definition or be named like a real interface.
    test.for(["strict", "host", "gnome-extension"] as const)("after removeNullish every app plug resolves to an interface (%s)", (flavor, { expect }) => {
      const configs: SnapPlugsConfig[] = [
        undefined,
        ["default"],
        ["default", "camera", { camera: null }],
        ["default", ...CONTENT_PLUGS.map(name => ({ [name]: null })), { [BROWSER_SUPPORT_INTERFACE]: null }],
        ["default", { "gpu-2404": null }, { "gtk-3-themes": { "default-provider": "custom-themes" } }],
      ]
      const renamedDefaults = new Set(Object.keys(core24ContentPlugs()))
      for (const plugs of configs) {
        const resolved = resolveCore24Plugs(plugs, flavor)
        const { plugs: root, apps } = removeNullish({ plugs: resolved.root, apps: { app: { plugs: resolved.app } } })
        const dangling = (apps.app.plugs ?? []).filter(name => root?.[name] == null && renamedDefaults.has(name))
        expect(dangling, JSON.stringify(plugs)).toEqual([])
      }
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
  // Stands in for the build's packager: notices are counted per scope, so each test gets fresh quotas.
  let project: object

  beforeEach(() => {
    project = {}
    warn = vi.spyOn(log, "warn").mockImplementation(() => undefined)
  })

  afterEach(() => {
    warn.mockRestore()
  })

  test("warns that the Snap Store reserves an explicitly configured allow-sandbox", ({ expect }) => {
    const { root } = resolveCore24Plugs([{ "browser-sandbox": { interface: "browser-support", "allow-sandbox": true } }, "network"], "strict")
    warnAboutAllowSandboxPlugs(root, "snapcraft.core24.plugs", project)
    warnAboutAllowSandboxPlugs(root, "snapcraft.core24.plugs", project)
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
      warnAboutAllowSandboxPlugs(resolveCore24Plugs(undefined, flavor).root, "snapcraft.core24.plugs", project)
    }
    expect(warn).not.toHaveBeenCalled()
  })

  test("announces the --no-sandbox default once per project", ({ expect }) => {
    // a multi-arch build of one app resolves the descriptor once per arch
    warnAboutCore24NoSandboxDefault(project)
    warnAboutCore24NoSandboxDefault(project)
    expect(warn).toHaveBeenCalledTimes(1)
    const message = warn.mock.calls[0][1] as string
    expect(message).toContain("--no-sandbox")
    expect(message).toContain("https://www.electron.build/docs/migration/v27-runtime-changes#")
  })

  test('announces the plugs that the "default" expansion now adds', ({ expect }) => {
    warnAboutCore24DefaultPlugsExpansion([], project)
    expect(warn).not.toHaveBeenCalled()
    warnAboutCore24DefaultPlugsExpansion(resolveCore24Plugs(["default", "camera"], "gnome-extension").addedByDefaultExpansion, project)
    expect(warn).toHaveBeenCalledTimes(1)
    const [fields, message] = warn.mock.calls[0] as [Record<string, string>, string]
    expect(fields.added).toBe(BROWSER_SUPPORT_INTERFACE)
    expect(message).toContain("https://www.electron.build/docs/migration/v27-runtime-changes#snap-core24-default-in-plugs-merges-the-full-default-set")
  })

  test("warns again for each other project built in the same process", ({ expect }) => {
    const { root } = resolveCore24Plugs([{ "browser-sandbox": { interface: "browser-support", "allow-sandbox": true } }], "strict")
    const added = resolveCore24Plugs(["default", "camera"], "gnome-extension").addedByDefaultExpansion
    const notify = (scope: object) => {
      warnAboutAllowSandboxPlugs(root, "snapcraft.core24.plugs", scope)
      warnAboutCore24NoSandboxDefault(scope)
      warnAboutCore24DefaultPlugsExpansion(added, scope)
    }

    notify(project)
    notify(project)
    expect(warn).toHaveBeenCalledTimes(3)

    const otherProject = {}
    notify(otherProject)
    notify(otherProject)
    expect(warn).toHaveBeenCalledTimes(6)
    // the second project gets the same three notices as the first
    const messages = warn.mock.calls.map((call: unknown[]) => call[1])
    expect(messages.slice(3)).toEqual(messages.slice(0, 3))

    // and the first project stays deduplicated
    notify(project)
    expect(warn).toHaveBeenCalledTimes(6)
  })
})
