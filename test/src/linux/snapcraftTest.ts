import { outputFile } from "fs-extra"
import * as path from "path"
import { app, appThrows, assertPack, EXTENDED_TIMEOUT, snapTarget } from "../helpers/packTester"
import * as which from "which"

// Inline so snapcraftTest.ts does NOT import from snapHeavyTest.ts — importing that file
// causes all its describe() blocks to execute here, registering heavy tests twice.
const hasSnapInstalled = () => process.env.RUN_SNAP_TESTS === "true" || which.sync("snap", { nothrow: true }) != null || which.sync("snapcraft", { nothrow: true }) != null

describe.heavy.ifEnv(hasSnapInstalled())("snapcraft", { sequential: true, timeout: EXTENDED_TIMEOUT }, () => {
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
})
