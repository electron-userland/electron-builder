import { outputFile, readFile } from "fs-extra"
import * as path from "path"
import * as which from "which"
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
            artifactName: "${productName}-${version}-${arch}.${ext}",
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
        artifactName: "${productName}-${version}-${arch}.${ext}",
        snapcraft: { base: "core24" },
      },
      effectiveOptionComputed: async ({ snap }) => {
        delete snap.platforms // arch-specific: varies by host; tested separately via armhf tests
        expect(snap).toMatchSnapshot()
        expect(snap.base).toBe("core24")
        expect(snap.apps?.testapp?.extensions).toContain("gnome")
        return Promise.resolve(true)
      },
    }))

  test("core24 gnome extension throws in destructive-mode", ({ expect }) =>
    appThrows(expect, {
      targets: snapTarget,
      config: {
        productName: "Sep",
        snapcraft: { base: "core24", core24: { useDestructiveMode: true, extensions: ["gnome"] } },
      },
    }))

  test("core24 no gnome extension", ({ expect }) =>
    app(expect, {
      targets: snapTarget,
      config: {
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

  test("core24 wayland disabled", ({ expect }) => {
    const appName = "sep"
    return app(expect, {
      targets: snapTarget,
      config: {
        extraMetadata: { name: appName },
        productName: "Sep",
        snapcraft: {
          base: "core24",
          core24: { forceX11: true },
        },
      },
      effectiveOptionComputed: async ({ snap }) => {
        delete snap.platforms // arch-specific: varies by host; tested separately via armhf tests
        expect(snap).toMatchSnapshot()
        // --ozone-platform=x11 contains "=", which snapd forbids in apps.<name>.command, so the
        // command is redirected to a launcher script that passes the flag through instead.
        expect(snap.apps?.[appName]?.command).toBe("command.sh")
        return Promise.resolve(true)
      },
    })
  })

  test("core24 executableArgs with forbidden chars use a launcher script", ({ expect }) => {
    const appName = "sep"
    return app(expect, {
      targets: snapTarget,
      config: {
        extraMetadata: { name: appName },
        productName: "Sep",
        snapcraft: {
          base: "core24",
          // --js-flags="..." contains both `=` and `"`, forbidden in apps.<name>.command.
          core24: { executableArgs: ['--js-flags="--max-old-space-size=4096"'] },
        },
      },
      effectiveOptionComputed: async ({ snap }) => {
        delete snap.platforms
        // command is redirected to the launcher script rather than embedding the forbidden args inline
        expect(snap.apps?.[appName]?.command).toBe("command.sh")
        return Promise.resolve(true)
      },
    })
  })

  test("core24 plain executableArgs stay inline (no launcher)", ({ expect }) => {
    const appName = "sep"
    return app(expect, {
      targets: snapTarget,
      config: {
        extraMetadata: { name: appName },
        productName: "Sep",
        // --disable-gpu has no forbidden characters, so it stays in the command verbatim
        snapcraft: { base: "core24", core24: { executableArgs: ["--disable-gpu"] } },
      },
      effectiveOptionComputed: async ({ snap }) => {
        delete snap.platforms
        expect(snap.apps?.[appName]?.command).toBe("app/sep --disable-gpu")
        return Promise.resolve(true)
      },
    })
  })

  test("core24 removes chrome-sandbox when launching with --no-sandbox", ({ expect }) => {
    const appName = "sep"
    return app(expect, {
      targets: snapTarget,
      config: {
        extraMetadata: { name: appName },
        productName: "Sep",
        // custom string plugs => no browser-support allow-sandbox => --no-sandbox is injected
        snapcraft: { base: "core24", core24: { plugs: ["network"] } },
      },
      effectiveOptionComputed: async ({ snap }) => {
        delete snap.platforms
        expect(snap.apps?.[appName]?.command).toBe("app/sep --no-sandbox")
        const organize = snap.parts?.[appName]?.organize as Record<string, string> | undefined
        expect(organize?.["chrome-sandbox"]).toBeUndefined()
        return Promise.resolve(true)
      },
    })
  })

  test("core24 keeps chrome-sandbox when browser-support sandbox is allowed", ({ expect }) => {
    const appName = "sep"
    return app(expect, {
      targets: snapTarget,
      config: {
        extraMetadata: { name: appName },
        productName: "Sep",
        // default config injects browser-support with allow-sandbox:true => no --no-sandbox
        snapcraft: { base: "core24" },
      },
      effectiveOptionComputed: async ({ snap }) => {
        delete snap.platforms
        expect(snap.apps?.[appName]?.command).toBe("app/sep")
        const organize = snap.parts?.[appName]?.organize as Record<string, string> | undefined
        expect(organize?.["chrome-sandbox"]).toBe("app/chrome-sandbox")
        return Promise.resolve(true)
      },
    })
  })

  test("core24 custom plugs with default expansion", ({ expect }) =>
    app(expect, {
      targets: snapTarget,
      config: {
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
        const appPlugs = snap.apps?.testapp?.plugs
        expect(appPlugs).toContain("camera")
        expect(appPlugs).toContain("desktop")
        return Promise.resolve(true)
      },
    }))

  test("core24 useMultipass build mode", ({ expect }) =>
    app(expect, {
      targets: snapTarget,
      config: {
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

  // ─── linux root config propagation ──────────────────────────────────────────
  //
  // Validates that fields set at the linux level (platformSpecificBuildOptions)
  // are coalesced into each core's options so they reach snapcraft.yaml and
  // the .desktop file without requiring duplication under core24/core18/etc.

  test("core24: linux.description propagates to snap.description", ({ expect }) =>
    app(expect, {
      targets: snapTarget,
      config: {
        extraMetadata: { name: "sep" },
        productName: "Sep",
        linux: { description: "From linux config" },
        snapcraft: { base: "core24" },
      },
      effectiveOptionComputed: async ({ snap }) => {
        delete snap.platforms
        expect(snap.description).toBe("From linux config")
        return Promise.resolve(true)
      },
    }))

  test("core24: per-core description overrides linux.description", ({ expect }) =>
    app(expect, {
      targets: snapTarget,
      config: {
        extraMetadata: { name: "sep" },
        productName: "Sep",
        linux: { description: "From linux config" },
        snapcraft: { base: "core24", core24: { description: "From core24 config" } },
      },
      effectiveOptionComputed: async ({ snap }) => {
        delete snap.platforms
        expect(snap.description).toBe("From core24 config")
        return Promise.resolve(true)
      },
    }))

  for (const core of ["core18", "core20", "core22"] as const) {
    test(`${core}: linux.description propagates to snap.description`, ({ expect }) =>
      app(expect, {
        targets: snapTarget,
        config: {
          extraMetadata: { name: "sep" },
          productName: "Sep",
          linux: { description: "From linux config" },
          snapcraft: { base: core },
        },
        effectiveOptionComputed: async ({ snap }) => {
          expect(snap.description).toBe("From linux config")
          return Promise.resolve(true)
        },
      }))

    test(`${core}: per-core description overrides linux.description`, ({ expect }) =>
      app(expect, {
        targets: snapTarget,
        config: {
          extraMetadata: { name: "sep" },
          productName: "Sep",
          linux: { description: "From linux config" },
          snapcraft: { base: core, [core]: { description: "From core config" } },
        },
        effectiveOptionComputed: async ({ snap }) => {
          expect(snap.description).toBe("From core config")
          return Promise.resolve(true)
        },
      }))
  }

  test("core22: linux.category propagates to desktop Categories", ({ expect }) =>
    app(expect, {
      targets: snapTarget,
      config: {
        extraMetadata: { name: "sep" },
        productName: "Sep",
        linux: { category: "AudioVideo" },
        snapcraft: { base: "core22" },
      },
      effectiveOptionComputed: async ({ desktopFile }) => {
        const content = await readFile(desktopFile, "utf8")
        expect(content).toContain("Categories=AudioVideo;")
        return Promise.resolve(true)
      },
    }))

  // ─── linux.compression → snap algorithm mapping ──────────────────────────────

  test("core24: linux.compression 'store' maps to lzo", ({ expect }) =>
    app(expect, {
      targets: snapTarget,
      config: {
        extraMetadata: { name: "sep" },
        productName: "Sep",
        linux: { compression: "store" },
        snapcraft: { base: "core24" },
      },
      effectiveOptionComputed: async ({ snap }) => {
        delete snap.platforms
        expect(snap.compression).toBe("lzo")
        return Promise.resolve(true)
      },
    }))

  test("core24: linux.compression 'maximum' maps to xz", ({ expect }) =>
    app(expect, {
      targets: snapTarget,
      config: {
        extraMetadata: { name: "sep" },
        productName: "Sep",
        linux: { compression: "maximum" },
        snapcraft: { base: "core24" },
      },
      effectiveOptionComputed: async ({ snap }) => {
        delete snap.platforms
        expect(snap.compression).toBe("xz")
        return Promise.resolve(true)
      },
    }))

  test("core24: linux.compression 'normal' leaves compression unset", ({ expect }) =>
    app(expect, {
      targets: snapTarget,
      config: {
        extraMetadata: { name: "sep" },
        productName: "Sep",
        linux: { compression: "normal" },
        snapcraft: { base: "core24" },
      },
      effectiveOptionComputed: async ({ snap }) => {
        delete snap.platforms
        expect(snap.compression).toBeUndefined()
        return Promise.resolve(true)
      },
    }))

  test("core24: per-core compression overrides linux.compression mapping", ({ expect }) =>
    app(expect, {
      targets: snapTarget,
      config: {
        extraMetadata: { name: "sep" },
        productName: "Sep",
        linux: { compression: "maximum" },
        snapcraft: { base: "core24", core24: { compression: "lzo" } },
      },
      effectiveOptionComputed: async ({ snap }) => {
        delete snap.platforms
        expect(snap.compression).toBe("lzo")
        return Promise.resolve(true)
      },
    }))

  for (const core of ["core18", "core20", "core22"] as const) {
    test(`${core}: linux.compression 'store' maps to lzo`, ({ expect }) =>
      app(expect, {
        targets: snapTarget,
        config: {
          extraMetadata: { name: "sep" },
          productName: "Sep",
          linux: { compression: "store" },
          snapcraft: { base: core, [core]: { useTemplateApp: false } },
        },
        effectiveOptionComputed: async ({ snap }) => {
          expect(snap.compression).toBe("lzo")
          return Promise.resolve(true)
        },
      }))

    test(`${core}: linux.compression 'maximum' maps to xz`, ({ expect }) =>
      app(expect, {
        targets: snapTarget,
        config: {
          extraMetadata: { name: "sep" },
          productName: "Sep",
          linux: { compression: "maximum" },
          snapcraft: { base: core, [core]: { useTemplateApp: false } },
        },
        effectiveOptionComputed: async ({ snap }) => {
          expect(snap.compression).toBe("xz")
          return Promise.resolve(true)
        },
      }))
  }

  test("core22: linux.compression 'normal' leaves compression unset", ({ expect }) =>
    app(expect, {
      targets: snapTarget,
      config: {
        extraMetadata: { name: "sep" },
        productName: "Sep",
        linux: { compression: "normal" },
        snapcraft: { base: "core22", core22: { useTemplateApp: false } },
      },
      effectiveOptionComputed: async ({ snap }) => {
        expect(snap.compression).toBeUndefined()
        return Promise.resolve(true)
      },
    }))

  test("core22: per-core compression overrides linux.compression mapping", ({ expect }) =>
    app(expect, {
      targets: snapTarget,
      config: {
        extraMetadata: { name: "sep" },
        productName: "Sep",
        linux: { compression: "store" },
        snapcraft: { base: "core22", core22: { compression: "xz", useTemplateApp: false } },
      },
      effectiveOptionComputed: async ({ snap }) => {
        expect(snap.compression).toBe("xz")
        return Promise.resolve(true)
      },
    }))

  test("custom pass-through: linux.description is not injected", ({ expect }) =>
    assertPack(
      expect,
      "test-app-one",
      {
        targets: snapTarget,
        config: {
          productName: "Sep",
          linux: { description: "Should not appear in custom snap" },
          snapcraft: {
            base: "custom",
            custom: { yaml: "custom-snapcraft.yaml" },
          },
        },
        effectiveOptionComputed: ({ snap }) => {
          expect(snap.description).toBe("Custom description.")
          return Promise.resolve(true)
        },
      },
      {
        projectDirCreated: async projectDir => {
          await outputFile(
            path.join(projectDir, "build", "custom-snapcraft.yaml"),
            [
              "name: sep",
              "base: core24",
              "version: '1.0.0'",
              "summary: Custom snap",
              "description: Custom description.",
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
          )
        },
      }
    ))

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
          productName: "Sep",
          snapcraft: {
            base: "core24",
            core24: { useMultipass: true },
          },
        },
      })
    })

    // End-to-end check that snapcraft accepts the generated launcher-script command and the
    // chrome-sandbox removal: forceX11 produces a "=" arg (forbidden inline) and the custom
    // string plugs force --no-sandbox (which strips chrome-sandbox).
    test("core24 useMultipass full build with launcher script + no-sandbox", async ({ expect }) => {
      await app(expect, {
        targets: snapTarget,
        config: {
          productName: "Sep",
          snapcraft: {
            base: "core24",
            core24: { useMultipass: true, forceX11: true, plugs: ["network"] },
          },
        },
      })
    })
  })
})
