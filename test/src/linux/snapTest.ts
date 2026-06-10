import { Arch, Platform } from "electron-builder"
import { app, assertPack, snapTarget } from "../helpers/packTester.js"

test.ifNotWindows("snap", ({ expect }) =>
  app(expect, {
    targets: snapTarget,
    config: {
      extraMetadata: {
        name: "sep",
      },
      productName: "Sep",
      snapcraft: {
        base: "core20",
      },
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

test.ifNotWindows("arm", ({ expect }) =>
  app(expect, {
    targets: Platform.LINUX.createTarget("snap", Arch.armv7l),
    config: {
      extraMetadata: {
        name: "sep",
      },
      productName: "Sep",
      snapcraft: {
        base: "core20",
      },
    },
  })
)

test.ifNotWindows("default stagePackages", async ({ expect }) => {
  for (const p of [["default"], ["default", "custom"], ["custom", "default"], ["foo1", "default", "foo2"]]) {
    await assertPack(expect, "test-app-one", {
      targets: snapTarget,
      config: {
        extraMetadata: {
          name: "sep",
        },
        productName: "Sep",
        snapcraft: {
          base: "core20",
          core20: {
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

test.ifNotWindows("classic confinement", ({ expect }) =>
  app(expect, {
    targets: snapTarget,
    config: {
      extraMetadata: {
        name: "cl-co-app",
      },
      productName: "Snap Electron App (classic confinement)",
      snapcraft: {
        base: "core20",
        core20: {
          confinement: "classic",
        },
      },
    },
  })
)

test.ifNotWindows("buildPackages", async ({ expect }) => {
  await assertPack(expect, "test-app-one", {
    targets: snapTarget,
    config: {
      extraMetadata: {
        name: "sep",
      },
      productName: "Sep",
      snapcraft: {
        base: "core20",
        core20: {
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

test.ifNotWindows("plugs option", async ({ expect }) => {
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
          base: "core20",
          core20: {
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

test.ifNotWindows("slots option", async ({ expect }) => {
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
          base: "core20",
          core20: {
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

test.ifNotWindows("custom env", ({ expect }) =>
  app(expect, {
    targets: snapTarget,
    config: {
      extraMetadata: {
        name: "sep",
      },
      productName: "Sep",
      snapcraft: {
        base: "core20",
        core20: {
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
  })
)

test.ifNotWindows("custom after, no desktop", ({ expect }) =>
  app(expect, {
    targets: snapTarget,
    config: {
      extraMetadata: {
        name: "sep",
      },
      productName: "Sep",
      snapcraft: {
        base: "core20",
        core20: {
          after: ["bar"],
        },
      },
    },
    effectiveOptionComputed: async ({ snap }) => {
      expect(snap).toMatchSnapshot()
      return Promise.resolve(true)
    },
  })
)

test.ifNotWindows("no desktop plugs", ({ expect }) =>
  app(expect, {
    targets: snapTarget,
    config: {
      extraMetadata: {
        name: "sep",
      },
      productName: "Sep",
      snapcraft: {
        base: "core20",
        core20: {
          plugs: ["foo", "bar"],
        },
      },
    },
    effectiveOptionComputed: async ({ snap, args }) => {
      expect(snap).toMatchSnapshot()
      expect(args).toContain("--exclude")
      return Promise.resolve(true)
    },
  })
)

test.ifNotWindows("auto start", ({ expect }) =>
  app(expect, {
    targets: snapTarget,
    config: {
      extraMetadata: {
        name: "sep",
      },
      productName: "Sep",
      snapcraft: {
        base: "core20",
        core20: {
          autoStart: true,
        },
      },
    },
    effectiveOptionComputed: async ({ snap }) => {
      expect(snap).toMatchSnapshot()
      expect(snap.apps.sep.autostart).toEqual("sep.desktop")
      return Promise.resolve(true)
    },
  })
)

test.ifNotWindows("default compression", ({ expect }) =>
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
  })
)

test.ifNotWindows("compression option", ({ expect }) =>
  app(expect, {
    targets: snapTarget,
    config: {
      extraMetadata: {
        name: "sep",
      },
      productName: "Sep",
      snapcraft: {
        base: "core20",
        core20: {
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
  })
)

test.ifNotWindows("default base", ({ expect }) =>
  app(expect, {
    targets: snapTarget,
    config: {
      productName: "Sep",
    },
    effectiveOptionComputed: async ({ snap }) => {
      expect(snap).toMatchSnapshot()
      expect(snap.base).toBe("core24")
      return Promise.resolve(true)
    },
  })
)

test.ifNotWindows("base option", ({ expect }) =>
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
  })
)

test.ifNotWindows("use template app", ({ expect }) =>
  app(expect, {
    targets: snapTarget,
    config: {
      snapcraft: {
        base: "core20",
        core20: {
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
  })
)
