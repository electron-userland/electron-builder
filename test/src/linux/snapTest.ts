import { Arch, Platform } from "electron-builder"
import { app, assertPack, snapTarget } from "../helpers/packTester"

test.ifDevOrLinuxCi("snap", ({ expect }) =>
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
  })
)

test.ifDevOrLinuxCi("arm", ({ expect }) =>
  app(expect, {
    targets: Platform.LINUX.createTarget("snap", Arch.armv7l),
    config: {
      extraMetadata: {
        name: "sep",
      },
      productName: "Sep",
    },
  })
)

test.ifDevOrLinuxCi("default stagePackages", async ({ expect }) => {
  for (const p of [["default"], ["default", "custom"], ["custom", "default"], ["foo1", "default", "foo2"]]) {
    await assertPack(expect, "test-app-one", {
      targets: snapTarget,
      config: {
        extraMetadata: {
          name: "sep",
        },
        productName: "Sep",
        snap: {
          stagePackages: p,
          plugs: p,
          confinement: "classic",
          // otherwise "parts" will be removed
          useTemplateApp: false,
        },
      },
      effectiveOptionComputed: async ({ snap, args }) => {
        delete snap.parts.app.source
        expect(snap).toMatchSnapshot()
        expect(args).not.toContain("--exclude")
        return true
      },
    })
  }
})

test.ifDevOrLinuxCi("classic confinement", ({ expect }) =>
  app(expect, {
    targets: snapTarget,
    config: {
      extraMetadata: {
        name: "cl-co-app",
      },
      productName: "Snap Electron App (classic confinement)",
      snap: {
        confinement: "classic",
      },
    },
  })
)

test.ifDevOrLinuxCi("buildPackages", async ({ expect }) => {
  await assertPack(expect, "test-app-one", {
    targets: snapTarget,
    config: {
      extraMetadata: {
        name: "sep",
      },
      productName: "Sep",
      snap: {
        buildPackages: ["foo1", "default", "foo2"],
        // otherwise "parts" will be removed
        useTemplateApp: false,
      },
    },
    effectiveOptionComputed: async ({ snap }) => {
      delete snap.parts.app.source
      expect(snap).toMatchSnapshot()
      return true
    },
  })
})

test.ifDevOrLinuxCi("plugs option", async ({ expect }) => {
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
        snap: {
          plugs: p,
          // otherwise "parts" will be removed
          useTemplateApp: false,
        },
      },
      effectiveOptionComputed: async ({ snap, args }) => {
        delete snap.parts.app.source
        expect(snap).toMatchSnapshot()
        expect(args).not.toContain("--exclude")
        return true
      },
    })
  }
})

test.ifDevOrLinuxCi("slots option", async ({ expect }) => {
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
        snap: {
          slots,
        },
      },
      effectiveOptionComputed: async ({ snap, args }) => {
        expect(snap).toMatchSnapshot()
        return true
      },
    })
  }
})

test.ifDevOrLinuxCi("custom env", ({ expect }) =>
  app(expect, {
    targets: snapTarget,
    config: {
      extraMetadata: {
        name: "sep",
      },
      productName: "Sep",
      snap: {
        environment: {
          FOO: "bar",
        },
      },
    },
    effectiveOptionComputed: async ({ snap }) => {
      expect(snap).toMatchSnapshot()
      return true
    },
  })
)

test.ifDevOrLinuxCi("custom after, no desktop", ({ expect }) =>
  app(expect, {
    targets: snapTarget,
    config: {
      extraMetadata: {
        name: "sep",
      },
      productName: "Sep",
      snap: {
        after: ["bar"],
      },
    },
    effectiveOptionComputed: async ({ snap }) => {
      expect(snap).toMatchSnapshot()
      return true
    },
  })
)

test.ifDevOrLinuxCi("no desktop plugs", ({ expect }) =>
  app(expect, {
    targets: snapTarget,
    config: {
      extraMetadata: {
        name: "sep",
      },
      productName: "Sep",
      snap: {
        plugs: ["foo", "bar"],
      },
    },
    effectiveOptionComputed: async ({ snap, args }) => {
      expect(snap).toMatchSnapshot()
      expect(args).toContain("--exclude")
      return true
    },
  })
)

test.ifDevOrLinuxCi("auto start", ({ expect }) =>
  app(expect, {
    targets: snapTarget,
    config: {
      extraMetadata: {
        name: "sep",
      },
      productName: "Sep",
      snap: {
        autoStart: true,
      },
    },
    effectiveOptionComputed: async ({ snap, args }) => {
      expect(snap).toMatchSnapshot()
      expect(snap.apps.sep.autostart).toEqual("sep.desktop")
      return true
    },
  })
)

test.ifDevOrLinuxCi("default compression", ({ expect }) =>
  app(expect, {
    targets: snapTarget,
    config: {
      extraMetadata: {
        name: "sep",
      },
      productName: "Sep",
    },
    effectiveOptionComputed: async ({ snap, args }) => {
      expect(snap).toMatchSnapshot()
      return true
    },
  })
)

test.ifDevOrLinuxCi("compression option", ({ expect }) =>
  app(expect, {
    targets: snapTarget,
    config: {
      extraMetadata: {
        name: "sep",
      },
      productName: "Sep",
      snap: {
        useTemplateApp: false,
        compression: "xz",
      },
    },
    effectiveOptionComputed: async ({ snap, args }) => {
      expect(snap).toMatchSnapshot()
      expect(snap.compression).toBe("xz")
      expect(args).toEqual(expect.arrayContaining(["--compression", "xz"]))
      return true
    },
  })
)

test.ifDevOrLinuxCi("default base", ({ expect }) =>
  app(expect, {
    targets: snapTarget,
    config: {
      productName: "Sep",
    },
    effectiveOptionComputed: async ({ snap }) => {
      expect(snap).toMatchSnapshot()
      expect(snap.base).toBe("core20")
      return true
    },
  })
)

test.ifDevOrLinuxCi("base option", ({ expect }) =>
  app(expect, {
    targets: snapTarget,
    config: {
      productName: "Sep",
      snap: {
        base: "core22",
      },
    },
    effectiveOptionComputed: async ({ snap }) => {
      expect(snap).toMatchSnapshot()
      expect(snap.base).toBe("core22")
      return true
    },
  })
)

test.ifDevOrLinuxCi("use template app", ({ expect }) =>
  app(expect, {
    targets: snapTarget,
    config: {
      snap: {
        useTemplateApp: true,
        compression: "xz",
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
      return true
    },
  })
)
