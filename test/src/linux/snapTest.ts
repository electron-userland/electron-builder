import { Arch, Platform } from "electron-builder"
import { app, assertPack, snapTarget } from "../helpers/packTester"

if (process.env.SNAP_TEST === "false") {
  fit("Skip snapTest suite — SNAP_TEST is set to false or Windows", () => {
    console.warn("[SKIP] Skip snapTest suite — SNAP_TEST is set to false")
  })
} else if (process.platform === "win32") {
  fit("Skip snapTest suite — Windows is not supported", () => {
    console.warn("[SKIP] Skip snapTest suite — Windows is not supported")
  })
}

test.ifAll.ifDevOrLinuxCi(
  "snap",
  app({
    targets: snapTarget,
    config: {
      extraMetadata: {
        name: "sep",
      },
      productName: "Sep",
    },
  })
)

test.ifAll.ifDevOrLinuxCi(
  "arm",
  app({
    targets: Platform.LINUX.createTarget("snap", Arch.armv7l),
    config: {
      extraMetadata: {
        name: "sep",
      },
      productName: "Sep",
    },
  })
)

test.ifAll.ifDevOrLinuxCi("default stagePackages", async () => {
  for (const p of [["default"], ["default", "custom"], ["custom", "default"], ["foo1", "default", "foo2"]]) {
    await assertPack("test-app-one", {
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

test.ifAll.ifDevOrLinuxCi(
  "classic confinement",
  app({
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

test.ifAll.ifDevOrLinuxCi("buildPackages", async () => {
  await assertPack("test-app-one", {
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

test.ifDevOrLinuxCi("plugs option", async () => {
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
    await assertPack("test-app-one", {
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

test.ifDevOrLinuxCi("slots option", async () => {
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
    await assertPack("test-app-one", {
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

test.ifDevOrLinuxCi(
  "custom env",
  app({
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

test.ifDevOrLinuxCi(
  "custom after, no desktop",
  app({
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

test.ifDevOrLinuxCi(
  "no desktop plugs",
  app({
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

test.ifAll.ifDevOrLinuxCi(
  "auto start",
  app({
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

test.ifDevOrLinuxCi(
  "default compression",
  app({
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

test.ifDevOrLinuxCi(
  "compression option",
  app({
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

test.ifDevOrLinuxCi(
  "default base",
  app({
    targets: snapTarget,
    config: {
      productName: "Sep",
    },
    effectiveOptionComputed: async ({ snap }) => {
      expect(snap).toMatchSnapshot()
      expect(snap.base).toBe("core18")
      return true
    },
  })
)

test.ifDevOrLinuxCi(
  "base option",
  app({
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

test.ifDevOrLinuxCi(
  "use template app",
  app({
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
