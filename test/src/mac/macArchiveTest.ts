import { Arch, exec } from "builder-util"
import { parseXml } from "builder-util-runtime"
import { Platform } from "electron-builder"
import { outputFile } from "fs-extra"
import * as fs from "fs/promises"
import * as path from "path"
import pathSorter from "path-sort"
import { assertThat } from "../helpers/fileAssert"
import { app, copyTestAsset, createMacTargetTest, getFixtureDir, parseFileList } from "../helpers/packTester"

test.ifMac("invalid target", ({ expect }) => expect(createMacTargetTest(expect, ["ttt" as any])).rejects.toThrow())

test.ifNotWindows("only zip", ({ expect }) => createMacTargetTest(expect, ["zip"], undefined, false /* no need to test sign */))

test.ifNotWindows("tar.gz", ({ expect }) => createMacTargetTest(expect, ["tar.gz"]))

// test.ifNotWindows("tar.xz", createTargetTest(["tar.xz"], ["Test App ßW-1.1.0-mac.tar.xz"]))

const it = process.env.CSC_KEY_PASSWORD == null ? test.skip : test.ifMac

it("pkg", ({ expect }) => createMacTargetTest(expect, ["pkg"]))

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
      signed: false,
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
      signed: false,
      projectDirCreated: projectDir => {
        return Promise.all([outputFile(path.join(projectDir, "extra.txt"), "test")])
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
      signed: false,
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
      signed: false,
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
      signed: false,
      projectDirCreated: async projectDir => {
        const extraPackagesDir = path.join(projectDir, extraPackages)
        await fs.mkdir(extraPackagesDir)
        await fs.writeFile(path.join(extraPackagesDir, "noop.pkg"), "data")
      },
    }
  )
})
