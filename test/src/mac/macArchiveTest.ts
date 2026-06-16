import { getPath7za } from "app-builder-lib/src/toolsets/7zip"
import { Arch, exec } from "builder-util"
import { parseXml } from "builder-util-runtime"
import { Platform } from "electron-builder"
import fsExtra from "fs-extra"
import * as fs from "fs/promises"
import * as path from "path"
import pathSorter from "path-sort"
import type { ExpectStatic } from "vitest"
import { assertThat } from "../helpers/fileAssert.js"
import { app, copyTestAsset, createMacTargetTest, getFixtureDir, parseFileList } from "../helpers/packTester.js"

test.ifMac("invalid target", ({ expect }) => expect(createMacTargetTest(expect, ["ttt" as any])).rejects.toThrow())

test.ifNotWindows("only zip", ({ expect }) => createMacTargetTest(expect, ["zip"], undefined, false /* no need to test sign */))

test.ifNotWindows("tar.gz", ({ expect }) => createMacTargetTest(expect, ["tar.gz"]))

// test.ifNotWindows("tar.xz", createTargetTest(["tar.xz"], ["Test App ßW-1.1.0-mac.tar.xz"]))

// Regression for #9846: the macOS zip and 7z targets must preserve .framework `Versions/Current`
// symlinks through the archive round-trip. Modern 7-Zip dereferences symlinks unless passed -snl;
// a dereferenced framework makes codesign report "bundle format is ambiguous" and breaks Squirrel.Mac
// auto-update. These build a real app, archive it, extract, and assert every framework symlink survived.
function createMacFrameworkSymlinkTest(expect: ExpectStatic, format: "zip" | "7z") {
  return app(
    expect,
    {
      targets: Platform.MAC.createTarget(format, Arch.x64),
      config: { mac: { target: format }, publish: null },
    },
    {
      signedMac: false,
      packed: async context => {
        const artifactName = (await fs.readdir(context.outDir)).find(name => name.endsWith(`.${format}`))
        expect(artifactName, `expected a .${format} artifact in ${context.outDir}`).toBeTruthy()
        const artifactPath = path.join(context.outDir, artifactName!)

        const extractDir = await context.tmpDir.createTempDir({ prefix: `mac-${format}-symlink` })
        if (format === "zip") {
          // `ditto -x -k` mirrors how Squirrel.Mac extracts the auto-update payload
          await exec("ditto", ["-x", "-k", artifactPath, extractDir])
        } else {
          await exec(await getPath7za(), ["x", `-o${extractDir}`, "-y", artifactPath])
        }

        const frameworksDir = path.join(extractDir, `${context.packager.appInfo.productFilename}.app`, "Contents", "Frameworks")
        const frameworks = (await fs.readdir(frameworksDir)).filter(name => name.endsWith(".framework"))
        expect(frameworks.length, "app should contain .framework bundles").toBeGreaterThan(0)
        for (const framework of frameworks) {
          const current = path.join(frameworksDir, framework, "Versions", "Current")
          const stat = await fs.lstat(current)
          expect(stat.isSymbolicLink(), `${framework}/Versions/Current must remain a symlink after ${format} round-trip`).toBe(true)
        }
      },
    }
  )
}

test.heavy.ifMac("zip preserves .framework symlinks (#9846)", ({ expect }) => createMacFrameworkSymlinkTest(expect, "zip"))

test.heavy.ifMac("7z preserves .framework symlinks (#9846)", ({ expect }) => createMacFrameworkSymlinkTest(expect, "7z"))

test.ifMac("pkg", ({ expect }) => createMacTargetTest(expect, ["pkg"]))

test.ifMac("empty installLocation", ({ expect }) =>
  app(
    expect,
    {
      targets: Platform.MAC.createTarget("pkg", Arch.x64),
      config: {
        pkg: {
          installLocation: "",
        },
      },
    },
    {
      signedMac: false,
      projectDirCreated: projectDir => {
        return Promise.all([copyTestAsset("license.txt", path.join(projectDir, "build", "license.txt"))])
      },
    }
  )
)

test.ifMac("extraDistFiles", ({ expect }) =>
  app(
    expect,
    {
      targets: Platform.MAC.createTarget("zip", Arch.x64),
      config: {
        mac: {
          extraDistFiles: "extra.txt",
        },
      },
    },
    {
      signedMac: false,
      projectDirCreated: projectDir => {
        return Promise.all([fsExtra.outputFile(path.join(projectDir, "extra.txt"), "test")])
      },
    }
  )
)

test.ifMac("pkg extended configuration", ({ expect }) =>
  app(
    expect,
    {
      targets: Platform.MAC.createTarget("pkg", Arch.x64),
      config: {
        pkg: {
          isRelocatable: false,
          isVersionChecked: false,
          hasStrictIdentifier: false,
          overwriteAction: "update",
        },
      },
    },
    {
      signedMac: false,
      packed: async context => {
        const pkgPath = path.join(context.outDir, "Test App ßW-1.1.0.pkg")
        const unpackedDir = path.join(context.outDir, "pkg-unpacked")
        await exec("pkgutil", ["--expand", pkgPath, unpackedDir])

        const packageInfoFile = path.join(unpackedDir, "org.electron-builder.testApp.pkg", "PackageInfo")
        const info = parseXml(await fs.readFile(packageInfoFile, "utf8"))

        const relocateElement = info.elementOrNull("relocate")
        if (relocateElement != null) {
          expect(relocateElement.elements).toBeNull()
        }

        const upgradeBundleElement = info.elementOrNull("upgrade-bundle")
        if (upgradeBundleElement != null) {
          expect(upgradeBundleElement.elements).toBeNull()
        }

        const updateBundleElement = info.elementOrNull("update-bundle")
        if (updateBundleElement != null) {
          expect(updateBundleElement.elements).toHaveLength(1)
        }

        const strictIdentifierElement = info.elementOrNull("strict-identifier")
        if (strictIdentifierElement != null) {
          expect(strictIdentifierElement.elements).toBeNull()
        }
      },
    }
  )
)

test.ifMac("pkg scripts", ({ expect }) =>
  app(
    expect,
    {
      targets: Platform.MAC.createTarget("pkg", Arch.x64),
    },
    {
      signedMac: false,
      projectDirCreated: async projectDir => {
        await fs.symlink(path.join(getFixtureDir(), "pkg-scripts"), path.join(projectDir, "build", "pkg-scripts"))
      },
      packed: async context => {
        const pkgPath = path.join(context.outDir, "Test App ßW-1.1.0.pkg")
        console.log("CALL")
        const fileList = pathSorter(parseFileList(await exec("pkgutil", ["--payload-files", pkgPath]), false))
        expect(fileList).toMatchSnapshot()

        const unpackedDir = path.join(context.outDir, "pkg-unpacked")
        await exec("pkgutil", ["--expand", pkgPath, unpackedDir])

        const info = parseXml(await fs.readFile(path.join(unpackedDir, "Distribution"), "utf8"))
        for (const element of info.getElements("pkg-ref")) {
          element.removeAttribute("installKBytes")
          element.removeAttribute("updateKBytes")
          const bundleVersion = element.elementOrNull("bundle-version")
          if (bundleVersion != null) {
            bundleVersion.element("bundle").removeAttribute("CFBundleVersion")
          }
        }

        // delete info.product.version
        info.element("product").removeAttribute("version")

        expect(info).toMatchSnapshot()

        const scriptDir = path.join(unpackedDir, "org.electron-builder.testApp.pkg", "Scripts")
        await assertThat(expect, path.join(scriptDir, "postinstall")).isFile()
        await assertThat(expect, path.join(scriptDir, "preinstall")).isFile()
      },
    }
  )
)

test.ifMac("pkg hostArchitectures for arm64", ({ expect }) =>
  app(
    expect,
    {
      targets: Platform.MAC.createTarget("pkg", Arch.arm64),
    },
    {
      signedMac: false,
      packed: async context => {
        const pkgPath = path.join(context.outDir, "Test App ßW-1.1.0-arm64.pkg")
        const unpackedDir = path.join(context.outDir, "pkg-unpacked")
        await exec("pkgutil", ["--expand", pkgPath, unpackedDir])

        const distributionXml = await fs.readFile(path.join(unpackedDir, "Distribution"), "utf8")
        expect(distributionXml).toContain('hostArchitectures="arm64"')
      },
    }
  )
)

test.ifMac("pkg hostArchitectures for x64", ({ expect }) =>
  app(
    expect,
    {
      targets: Platform.MAC.createTarget("pkg", Arch.x64),
    },
    {
      signedMac: false,
      packed: async context => {
        const pkgPath = path.join(context.outDir, "Test App ßW-1.1.0.pkg")
        const unpackedDir = path.join(context.outDir, "pkg-unpacked")
        await exec("pkgutil", ["--expand", pkgPath, unpackedDir])

        const distributionXml = await fs.readFile(path.join(unpackedDir, "Distribution"), "utf8")
        expect(distributionXml).toContain('hostArchitectures="x86_64"')
      },
    }
  )
)

test.ifMac("pkg minimumSystemVersion adds volume-check", ({ expect }) =>
  app(
    expect,
    {
      targets: Platform.MAC.createTarget("pkg", Arch.arm64),
      config: {
        mac: {
          minimumSystemVersion: "12.0",
        },
      },
    },
    {
      signedMac: false,
      packed: async context => {
        const pkgPath = path.join(context.outDir, "Test App ßW-1.1.0-arm64.pkg")
        const unpackedDir = path.join(context.outDir, "pkg-unpacked")
        await exec("pkgutil", ["--expand", pkgPath, unpackedDir])

        const distributionXml = await fs.readFile(path.join(unpackedDir, "Distribution"), "utf8")
        expect(distributionXml).toContain("<volume-check>")
        expect(distributionXml).toContain('<os-version min="12.0"')
      },
    }
  )
)

test.ifMac("pkg extra packages", async ({ expect }) => {
  const extraPackages = path.join("build", "extra-packages")
  return app(
    expect,
    {
      targets: Platform.MAC.createTarget("pkg", Arch.x64),
      config: {
        pkg: {
          extraPkgsDir: extraPackages,
        },
      },
    },
    {
      signedMac: false,
      projectDirCreated: async projectDir => {
        const extraPackagesDir = path.join(projectDir, extraPackages)
        await fs.mkdir(extraPackagesDir)
        await fs.writeFile(path.join(extraPackagesDir, "noop.pkg"), "data")
      },
    }
  )
})
