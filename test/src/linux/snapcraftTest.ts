import { outputFile } from "fs-extra"
import * as path from "path"
import which from "which"
import { app, appThrows, assertPack, EXTENDED_TIMEOUT, snapTarget } from "../helpers/packTester"
// Inline so snapcraftTest.ts does NOT import from snapHeavyTest.ts — importing that file
// causes all its describe() blocks to execute here, registering heavy tests twice.
//
// No snapcraft binary is needed: every test uses effectiveOptionComputed: () => true to skip
// the actual build and only validates the generated snapcraft.yaml descriptor.
const hasSnapInstalled = () => process.platform !== "win32"

describe.heavy.ifEnv(hasSnapInstalled())("snapcraft", { sequential: true, timeout: EXTENDED_TIMEOUT }, () => {
  // ─── legacy cores (core18 / core20 / core22) ─────────────────────────────────
  //
  // Each iteration mirrors the test cases in snapTest.ts but uses the new
  // `snapcraft: { base, [core]: { ... } }` structured config instead of the
  // deprecated flat `snap:` key.

  for (const core of ["core18", "core20", "core22"] as const) {
    test(`default stagePackages (${core})`, async ({ expect }) => {
      for (const p of [["default"], ["default", "custom"], ["custom", "default"], ["foo1", "default", "foo2"]]) {
        await assertPack(expect, "test-app-one", {
          targets: snapTarget,
          config: {
            extraMetadata: { name: "sep" },
            productName: "Sep",
            snapcraft: {
              base: core,
              [core]: { stagePackages: p, plugs: p, confinement: "classic", useTemplateApp: false },
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

    test(`classic confinement (${core})`, ({ expect }) =>
      app(expect, {
        targets: snapTarget,
        config: {
          extraMetadata: { name: "cl-co-app" },
          productName: "Snap Electron App (classic confinement)",
          snapcraft: { base: core, [core]: { confinement: "classic" } },
        },
        effectiveOptionComputed: async ({ snap }) => {
          expect(snap).toMatchSnapshot()
          return Promise.resolve(true)
        },
      }))

    test(`buildPackages (${core})`, async ({ expect }) => {
      await assertPack(expect, "test-app-one", {
        targets: snapTarget,
        config: {
          extraMetadata: { name: "sep" },
          productName: "Sep",
          snapcraft: { base: core, [core]: { buildPackages: ["foo1", "default", "foo2"], useTemplateApp: false } },
        },
        effectiveOptionComputed: async ({ snap }) => {
          delete snap.parts.app.source
          expect(snap).toMatchSnapshot()
          return Promise.resolve(true)
        },
      })
    })

    test(`plugs option (${core})`, async ({ expect }) => {
      for (const p of [
        [{ "browser-sandbox": { interface: "browser-support", "allow-sandbox": true } }, "another-simple-plug-name"],
        { "browser-sandbox": { interface: "browser-support", "allow-sandbox": true }, "another-simple-plug-name": null },
      ]) {
        await assertPack(expect, "test-app-one", {
          targets: snapTarget,
          config: { snapcraft: { base: core, [core]: { plugs: p, useTemplateApp: false } } },
          effectiveOptionComputed: async ({ snap, args }) => {
            delete snap.parts.app.source
            expect(snap).toMatchSnapshot()
            expect(args).not.toContain("--exclude")
            return Promise.resolve(true)
          },
        })
      }
    })

    test(`slots option (${core})`, async ({ expect }) => {
      for (const slots of [
        ["foo", "bar"],
        [{ mpris: { interface: "mpris", name: "chromium" } }, "another-simple-slot-name"],
      ]) {
        await assertPack(expect, "test-app-one", {
          targets: snapTarget,
          config: {
            extraMetadata: { name: "sep" },
            productName: "Sep",
            snapcraft: { base: core, [core]: { slots } },
          },
          effectiveOptionComputed: async ({ snap }) => {
            expect(snap).toMatchSnapshot()
            return Promise.resolve(true)
          },
        })
      }
    })

    test(`custom env (${core})`, ({ expect }) =>
      app(expect, {
        targets: snapTarget,
        config: {
          extraMetadata: { name: "sep" },
          productName: "Sep",
          snapcraft: { base: core, [core]: { environment: { FOO: "bar" } } },
        },
        effectiveOptionComputed: async ({ snap }) => {
          expect(snap).toMatchSnapshot()
          return Promise.resolve(true)
        },
      }))

    test(`custom after, no desktop (${core})`, ({ expect }) =>
      app(expect, {
        targets: snapTarget,
        config: {
          extraMetadata: { name: "sep" },
          productName: "Sep",
          snapcraft: { base: core, [core]: { after: ["bar"] } },
        },
        effectiveOptionComputed: async ({ snap }) => {
          expect(snap).toMatchSnapshot()
          return Promise.resolve(true)
        },
      }))

    test(`no desktop plugs (${core})`, ({ expect }) =>
      app(expect, {
        targets: snapTarget,
        config: {
          extraMetadata: { name: "sep" },
          productName: "Sep",
          snapcraft: { base: core, [core]: { plugs: ["foo", "bar"] } },
        },
        effectiveOptionComputed: async ({ snap, args }) => {
          expect(snap).toMatchSnapshot()
          expect(args).toContain("--exclude")
          return Promise.resolve(true)
        },
      }))

    test(`auto start (${core})`, ({ expect }) =>
      app(expect, {
        targets: snapTarget,
        config: {
          extraMetadata: { name: "sep" },
          productName: "Sep",
          snapcraft: { base: core, [core]: { autoStart: true } },
        },
        effectiveOptionComputed: async ({ snap }) => {
          expect(snap).toMatchSnapshot()
          expect(snap.apps.sep.autostart).toEqual("sep.desktop")
          return Promise.resolve(true)
        },
      }))

    test(`compression option (${core})`, ({ expect }) =>
      app(expect, {
        targets: snapTarget,
        config: {
          extraMetadata: { name: "sep" },
          productName: "Sep",
          snapcraft: { base: core, [core]: { useTemplateApp: false, compression: "xz" } },
        },
        effectiveOptionComputed: async ({ snap, args }) => {
          expect(snap).toMatchSnapshot()
          expect(snap.compression).toBe("xz")
          expect(args).toEqual(expect.arrayContaining(["--compression", "xz"]))
          return Promise.resolve(true)
        },
      }))

    test(`use template app (${core})`, ({ expect }) =>
      app(expect, {
        targets: snapTarget,
        config: {
          snapcraft: { base: core, [core]: { useTemplateApp: true, compression: "xz" } },
        },
        effectiveOptionComputed: async ({ snap, args }) => {
          expect(snap).toMatchSnapshot()
          expect(snap.parts).toBeUndefined()
          expect(snap.compression).toBeUndefined()
          expect(snap.contact).toBeUndefined()
          expect(snap.donation).toBeUndefined()
          expect(snap.issues).toBeUndefined()
          expect(snap["source-code"]).toBeUndefined()
          expect(snap.website).toBeUndefined()
          expect(args).toEqual(expect.arrayContaining(["--exclude", "chrome-sandbox", "--compression", "xz"]))
          return Promise.resolve(true)
        },
      }))
  }

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
        delete snap.platforms // arch-specific: varies by host; tested separately via armhf tests
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
        delete snap.platforms // arch-specific: varies by host; tested separately via armhf tests
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
        delete snap.platforms // arch-specific: varies by host; tested separately via armhf tests
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
        delete snap.platforms // arch-specific: varies by host; tested separately via armhf tests
        expect(snap).toMatchSnapshot()
        // "default" should expand to the full default plug list plus "camera"
        const appPlugs = snap.apps?.sep?.plugs ?? []
        expect(appPlugs).toContain("camera")
        expect(appPlugs).toContain("desktop")
        return Promise.resolve(true)
      },
    }))

  test("core24 useMultipass build mode", ({ expect }) =>
    app(expect, {
      targets: snapTarget,
      config: {
        extraMetadata: { name: "sep" },
        productName: "Sep",
        snapcraft: { base: "core24", core24: { useMultipass: true } },
      },
      effectiveOptionComputed: async ({ useMultipass, useLXD, useDestructiveMode }) => {
        expect(useMultipass).toBe(true)
        expect(useLXD).toBe(false)
        expect(useDestructiveMode).toBe(false)
        return Promise.resolve(true)
      },
    }))

  test("core24 useLXD build mode", ({ expect }) =>
    app(expect, {
      targets: snapTarget,
      config: {
        extraMetadata: { name: "sep" },
        productName: "Sep",
        snapcraft: { base: "core24", core24: { useLXD: true } },
      },
      effectiveOptionComputed: async ({ useLXD, useMultipass, useDestructiveMode }) => {
        expect(useLXD).toBe(true)
        expect(useMultipass).toBe(false)
        expect(useDestructiveMode).toBe(false)
        return Promise.resolve(true)
      },
    }))

  test("core24 remoteBuild build mode", ({ expect }) =>
    app(expect, {
      targets: snapTarget,
      config: {
        extraMetadata: { name: "sep" },
        productName: "Sep",
        snapcraft: {
          base: "core24",
          core24: { remoteBuild: { enabled: true, acceptPublicUpload: true } },
        },
      },
      effectiveOptionComputed: async ({ remoteBuild, useLXD, useMultipass }) => {
        expect(remoteBuild?.enabled).toBe(true)
        expect(remoteBuild?.acceptPublicUpload).toBe(true)
        expect(useLXD).toBe(false)
        expect(useMultipass).toBe(false)
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
          delete snap.platforms // arch-specific: varies by host; tested separately via armhf tests
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

  // ─── Real Multipass build ────────────────────────────────────────────────────
  // Runs only when Multipass is available (local macOS dev machines).
  // Skipped on GitHub Actions macOS runners (nested VMs not supported).
  // LXD cannot run on macOS — its config path is validated by the
  // "core24 useLXD build mode" effectiveOptionComputed test above.
  const hasMultipassInstalled = () => which.sync("multipass", { nothrow: true }) != null

  describe.skipIf(!hasMultipassInstalled())("core24 Multipass real build", { sequential: true, timeout: EXTENDED_TIMEOUT }, () => {
    test("core24 useMultipass full build", async ({ expect }) => {
      await app(expect, {
        targets: snapTarget,
        config: {
          extraMetadata: { name: "sep" },
          productName: "Sep",
          snapcraft: {
            base: "core24",
            core24: { useMultipass: true },
          },
        },
      })
    })
  })
})
