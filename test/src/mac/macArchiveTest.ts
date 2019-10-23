import { exec } from "builder-util"
import { parseXml } from "builder-util-runtime"
import { Platform } from "electron-builder"
import { outputFile } from "fs-extra"
import { promises as fs } from "fs"
import * as path from "path"
import pathSorter from "path-sort"
import { assertThat } from "../helpers/fileAssert"
import { app, copyTestAsset, createMacTargetTest, getFixtureDir, parseFileList } from "../helpers/packTester"

test.ifMac.ifAll("invalid target", () => assertThat(createMacTargetTest(["ttt" as any])()).throws())

test.ifNotWindows.ifAll("only zip", createMacTargetTest(["zip"], undefined, false /* no need to test sign */))

test.ifNotWindows.ifAll("tar.gz", createMacTargetTest(["tar.gz"]))

const it = process.env.CSC_KEY_PASSWORD == null ? test.skip : test.ifMac

it("pkg", createMacTargetTest(["pkg"]))

test.ifAll.ifMac("empty installLocation", app({
  targets: Platform.MAC.createTarget("pkg"),
  config: {
    pkg: {
      installLocation: "",
    }
  }
}, {
  signed: false,
  projectDirCreated: projectDir => {
    return Promise.all([
      copyTestAsset("license.txt", path.join(projectDir, "build", "license.txt")),
    ])
  },
}))

test.ifAll.ifMac("extraDistFiles", app({
  targets: Platform.MAC.createTarget("zip"),
  config: {
    mac: {
      extraDistFiles: "extra.txt"
    }
  }
}, {
  signed: false,
  projectDirCreated: projectDir => {
    return Promise.all([
      outputFile(path.join(projectDir, "extra.txt"), "test"),
    ])
  },
}))

test.ifAll.ifMac("pkg extended configuration", app({
  targets: Platform.MAC.createTarget("pkg"),
  config: {
    pkg: {
      isRelocatable: false,
      isVersionChecked: false,
      hasStrictIdentifier: false,
      overwriteAction: "update",
    }
  }
}, {
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
  }
}))

test.ifAll.ifMac("pkg scripts", app({
  targets: Platform.MAC.createTarget("pkg"),
}, {
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
    await Promise.all([
      assertThat(path.join(scriptDir, "postinstall")).isFile(),
      assertThat(path.join(scriptDir, "preinstall")).isFile(),
    ])
  }
}))

// todo failed on Travis CI
//test("tar.xz", createTargetTest(["tar.xz"], ["Test App ßW-1.1.0-mac.tar.xz"]))