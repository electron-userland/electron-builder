import { Arch, Platform } from "electron-builder"
import { outputFile } from "fs-extra"
import * as path from "path"
import { app, appThrows, assertPack, EXTENDED_TIMEOUT, snapTarget } from "../helpers/packTester"
import * as which from "which"

// Inline so snapTest.ts does NOT import from snapHeavyTest.ts — importing that file
// causes all its describe() blocks to execute here, registering heavy tests twice.
const hasSnapInstalled = () => process.env.RUN_SNAP_TESTS === "true" || which.sync("snap", { nothrow: true }) != null || which.sync("snapcraft", { nothrow: true }) != null

describe.heavy.ifEnv(hasSnapInstalled())("snap", { sequential: true, timeout: EXTENDED_TIMEOUT }, () => {
  test("snap", ({ expect }) =>
    app(expect, {
      targets: snapTarget,
      config: {
        extraMetadata: {
          name: "sep",
        },
        productName: "Sep",
        electronFuses: {
          runAsNode: true,
          enableCookieEncryption: true,
          enableNodeOptionsEnvironmentVariable: true,
          enableNodeCliInspectArguments: true,
          enableEmbeddedAsarIntegrityValidation: true,
          onlyLoadAppFromAsar: true,
          loadBrowserProcessSpecificV8Snapshot: true,
          grantFileProtocolExtraPrivileges: undefined, // unsupported on current electron version in our tests
        },
      },
    }))

  test("arm", ({ expect }) =>
    app(expect, {
      targets: Platform.LINUX.createTarget("snap", Arch.armv7l),
      config: {
        extraMetadata: {
          name: "sep",
        },
        productName: "Sep",
      },
    }))

  test("default stagePackages", async ({ expect }) => {
    for (const p of [["default"], ["default", "custom"], ["custom", "default"], ["foo1", "default", "foo2"]]) {
      await assertPack(expect, "test-app-one", {
        targets: snapTarget,
        config: {
          extraMetadata: {
            name: "sep",
          },
          productName: "Sep",
          snapcraft: {
            base: "core22",
            core22: {
              stagePackages: p,
              plugs: p,
              confinement: "classic",
              // otherwise "parts" will be removed
              useTemplateApp: false,
            },
          },
        },
        effectiveOptionComputed: async ({ snap, args }) => {
          delete snap.parts.app.source
          expect(snap).toMatchSnapshot()
          expect(args).not.toContain("--exclude")
          return Promise.resolve(true)
        },
      })
    }
  })

  test("classic confinement", ({ expect }) =>
    app(expect, {
      targets: snapTarget,
      config: {
        extraMetadata: {
          name: "cl-co-app",
        },
        productName: "Snap Electron App (classic confinement)",
        snapcraft: {
          base: "core22",
          core22: {
            confinement: "classic",
          },
        },
      },
    }))

  test("buildPackages", async ({ expect }) => {
    await assertPack(expect, "test-app-one", {
      targets: snapTarget,
      config: {
        extraMetadata: {
          name: "sep",
        },
        productName: "Sep",
        snapcraft: {
          base: "core22",
          core22: {
            buildPackages: ["foo1", "default", "foo2"],
            // otherwise "parts" will be removed
            useTemplateApp: false,
          },
        },
      },
      effectiveOptionComputed: async ({ snap }) => {
        delete snap.parts.app.source
        expect(snap).toMatchSnapshot()
        return Promise.resolve(true)
      },
    })
  })

  test("plugs option", async ({ expect }) => {
    for (const p of [
      [
        {
          "browser-sandbox": {
            interface: "browser-support",
            "allow-sandbox": true,
          },
        },
        "another-simple-plug-name",
      ],
      {
        "browser-sandbox": {
          interface: "browser-support",
          "allow-sandbox": true,
        },
        "another-simple-plug-name": null,
      },
    ]) {
      await assertPack(expect, "test-app-one", {
        targets: snapTarget,
        config: {
          snapcraft: {
            base: "core22",
            core22: {
              plugs: p,
              // otherwise "parts" will be removed
              useTemplateApp: false,
            },
          },
        },
        effectiveOptionComputed: async ({ snap, args }) => {
          delete snap.parts.app.source
          expect(snap).toMatchSnapshot()
          expect(args).not.toContain("--exclude")
          return Promise.resolve(true)
        },
      })
    }
  })

  test("slots option", async ({ expect }) => {
    for (const slots of [
      ["foo", "bar"],
      [
        {
          mpris: {
            interface: "mpris",
            name: "chromium",
          },
        },
        "another-simple-slot-name",
      ],
    ]) {
      await assertPack(expect, "test-app-one", {
        targets: snapTarget,
        config: {
          extraMetadata: {
            name: "sep",
          },
          productName: "Sep",
          snapcraft: {
            base: "core22",
            core22: {
              slots,
            },
          },
        },
        effectiveOptionComputed: async ({ snap }) => {
          expect(snap).toMatchSnapshot()
          return Promise.resolve(true)
        },
      })
    }
  })

  test("custom env", ({ expect }) =>
    app(expect, {
      targets: snapTarget,
      config: {
        extraMetadata: {
          name: "sep",
        },
        productName: "Sep",
        snapcraft: {
          base: "core22",
          core22: {
            environment: {
              FOO: "bar",
            },
          },
        },
      },
      effectiveOptionComputed: async ({ snap }) => {
        expect(snap).toMatchSnapshot()
        return Promise.resolve(true)
      },
    }))

  test("custom after, no desktop", ({ expect }) =>
    app(expect, {
      targets: snapTarget,
      config: {
        extraMetadata: {
          name: "sep",
        },
        productName: "Sep",
        snapcraft: {
          base: "core22",
          core22: {
            after: ["bar"],
          },
        },
      },
      effectiveOptionComputed: async ({ snap }) => {
        expect(snap).toMatchSnapshot()
        return Promise.resolve(true)
      },
    }))

  test("no desktop plugs", ({ expect }) =>
    app(expect, {
      targets: snapTarget,
      config: {
        extraMetadata: {
          name: "sep",
        },
        productName: "Sep",
        snapcraft: {
          base: "core22",
          core22: {
            plugs: ["foo", "bar"],
          },
        },
      },
      effectiveOptionComputed: async ({ snap, args }) => {
        expect(snap).toMatchSnapshot()
        expect(args).toContain("--exclude")
        return Promise.resolve(true)
      },
    }))

  test("auto start", ({ expect }) =>
    app(expect, {
      targets: snapTarget,
      config: {
        extraMetadata: {
          name: "sep",
        },
        productName: "Sep",
        snapcraft: {
          base: "core22",
          core22: {
            autoStart: true,
          },
        },
      },
      effectiveOptionComputed: async ({ snap }) => {
        expect(snap).toMatchSnapshot()
        expect(snap.apps.sep.autostart).toEqual("sep.desktop")
        return Promise.resolve(true)
      },
    }))

  test("default compression", ({ expect }) =>
    app(expect, {
      targets: snapTarget,
      config: {
        extraMetadata: {
          name: "sep",
        },
        productName: "Sep",
      },
      effectiveOptionComputed: async ({ snap }) => {
        expect(snap).toMatchSnapshot()
        return Promise.resolve(true)
      },
    }))

  test("compression option", ({ expect }) =>
    app(expect, {
      targets: snapTarget,
      config: {
        extraMetadata: {
          name: "sep",
        },
        productName: "Sep",
        snapcraft: {
          base: "core22",
          core22: {
            useTemplateApp: false,
            compression: "xz",
          },
        },
      },
      effectiveOptionComputed: async ({ snap, args }) => {
        expect(snap).toMatchSnapshot()
        expect(snap.compression).toBe("xz")
        expect(args).toEqual(expect.arrayContaining(["--compression", "xz"]))
        return Promise.resolve(true)
      },
    }))

  test("default base", ({ expect }) =>
    app(expect, {
      targets: snapTarget,
      config: {
        productName: "Sep",
      },
      effectiveOptionComputed: async ({ snap }) => {
        expect(snap).toMatchSnapshot()
        expect(snap.base).toBe("core20")
        return Promise.resolve(true)
      },
    }))

  test("base option", ({ expect }) =>
    app(expect, {
      targets: snapTarget,
      config: {
        productName: "Sep",
        snapcraft: {
          base: "core22",
        },
      },
      effectiveOptionComputed: async ({ snap }) => {
        expect(snap).toMatchSnapshot()
        expect(snap.base).toBe("core22")
        return Promise.resolve(true)
      },
    }))

  test("use template app", ({ expect }) =>
    app(expect, {
      targets: snapTarget,
      config: {
        snapcraft: {
          base: "core22",
          core22: {
            useTemplateApp: true,
            compression: "xz",
          },
        },
      },
      effectiveOptionComputed: async ({ snap, args }) => {
        expect(snap).toMatchSnapshot()
        expect(snap.parts).toBeUndefined()
        expect(snap.compression).toBeUndefined()
        expect(snap.contact).toBeUndefined()
        expect(snap.donation).toBeUndefined()
        expect(snap.issues).toBeUndefined()
        expect(snap.parts).toBeUndefined()
        expect(snap["source-code"]).toBeUndefined()
        expect(snap.website).toBeUndefined()
        expect(args).toEqual(expect.arrayContaining(["--exclude", "chrome-sandbox", "--compression", "xz"]))
        return Promise.resolve(true)
      },
    }))

  // ─── core24 tests ────────────────────────────────────────────────────────────

  test("core24 default (gnome extension)", ({ expect }) =>
    app(expect, {
      targets: snapTarget,
      config: {
        extraMetadata: { name: "sep" },
        productName: "Sep",
        snapcraft: { base: "core24" },
      },
      effectiveOptionComputed: async ({ snap }) => {
        expect(snap).toMatchSnapshot()
        expect(snap.base).toBe("core24")
        expect(snap.apps?.sep?.extensions).toContain("gnome")
        return Promise.resolve(true)
      },
    }))

  test("core24 gnome extension throws in destructive-mode", ({ expect }) =>
    appThrows(expect, {
      targets: snapTarget,
      config: {
        extraMetadata: { name: "sep" },
        productName: "Sep",
        snapcraft: { base: "core24", core24: { useDestructiveMode: true, extensions: ["gnome"] } },
      },
    }))

  test("core24 no gnome extension", ({ expect }) =>
    app(expect, {
      targets: snapTarget,
      config: {
        extraMetadata: { name: "sep" },
        productName: "Sep",
        snapcraft: {
          base: "core24",
          // extensions: [] opts out of gnome; without it isHostMode()=false adds gnome by default
          core24: { extensions: [] },
        },
      },
      effectiveOptionComputed: async ({ snap }) => {
        expect(snap).toMatchSnapshot()
        expect(snap.base).toBe("core24")
        // Without GNOME extension, manual content snaps must be defined at root level
        expect(snap.plugs).toBeDefined()
        expect(snap.apps?.sep?.extensions).toBeUndefined()
        return Promise.resolve(true)
      },
    }))

  test("core24 wayland disabled", ({ expect }) =>
    app(expect, {
      targets: snapTarget,
      config: {
        extraMetadata: { name: "sep" },
        productName: "Sep",
        snapcraft: {
          base: "core24",
          core24: { allowNativeWayland: false },
        },
      },
      effectiveOptionComputed: async ({ snap }) => {
        expect(snap).toMatchSnapshot()
        expect(snap.environment?.["DISABLE_WAYLAND"]).toBe("1")
        return Promise.resolve(true)
      },
    }))

  test("core24 custom plugs with default expansion", ({ expect }) =>
    app(expect, {
      targets: snapTarget,
      config: {
        extraMetadata: { name: "sep" },
        productName: "Sep",
        snapcraft: {
          base: "core24",
          core24: {
            plugs: ["default", "camera"],
          },
        },
      },
      effectiveOptionComputed: async ({ snap }) => {
        expect(snap).toMatchSnapshot()
        // "default" should expand to the full default plug list plus "camera"
        const appPlugs = snap.apps?.sep?.plugs ?? []
        expect(appPlugs).toContain("camera")
        expect(appPlugs).toContain("desktop")
        return Promise.resolve(true)
      },
    }))

  test("custom snap yamlPath pass-through", async ({ expect }) => {
    await assertPack(
      expect,
      "test-app-one",
      {
        targets: snapTarget,
        config: {
          extraMetadata: { name: "sep" },
          productName: "Sep",
          snapcraft: {
            base: "custom",
            custom: { yaml: "custom-snapcraft.yaml" },
          },
        },
        effectiveOptionComputed: ({ snap }) => {
          expect(snap).toMatchSnapshot()
          // electron-builder must not inject any extra plugs or extensions
          expect(snap.name).toBe("sep")
          expect(snap.base).toBe("core24")
          return Promise.resolve(true)
        },
      },
      {
        projectDirCreated: async projectDir => {
          // Write a minimal valid snapcraft.yaml that electron-builder should pass through unchanged
          const customYaml = [
            "name: sep",
            "base: core24",
            "version: '1.0.0'",
            "summary: Custom snap (pass-through)",
            "description: |",
            "  Built with a custom snapcraft.yaml via electron-builder.",
            "confinement: strict",
            "grade: stable",
            "parts:",
            "  app:",
            "    plugin: dump",
            "    source: .",
            "apps:",
            "  sep:",
            "    command: sep",
          ].join("\n")
          await outputFile(path.join(projectDir, "build", "custom-snapcraft.yaml"), customYaml)
        },
      }
    )
  })
})
