import BluebirdPromise from "bluebird-lst"
import { exec } from "builder-util"
import { parseXml } from "builder-util-runtime"
import { Platform } from "electron-builder"
import { readFile, symlink } from "fs-extra-p"
import * as path from "path"
import pathSorter from "path-sort"
import { assertThat } from "../helpers/fileAssert"
import { app, copyTestAsset, createMacTargetTest, getFixtureDir, parseFileList } from "../helpers/packTester"

test.ifMac("invalid target", () => assertThat(createMacTargetTest(["ttt" as any])()).throws())

test.ifNotWindows("only zip", createMacTargetTest(["zip"]))

test.ifNotWindows("tar.gz", createMacTargetTest(["tar.gz"]))

const it = process.env.CSC_KEY_PASSWORD == null ? test.skip : test.ifMac

it("pkg", createMacTargetTest(["pkg"]))

test.ifAll.ifMac("empty installLocation", app({
  targets: Platform.MAC.createTarget("pkg"),
  config: {
    pkg: {
      installLocation: ""
    }
  }
}, {
  signed: false,
  projectDirCreated: projectDir => {
    return BluebirdPromise.all([
      copyTestAsset("license.txt", path.join(projectDir, "build", "license.txt")),
    ])
  },
}))

test.ifAll.ifMac("pkg scripts", app({
  targets: Platform.MAC.createTarget("pkg"),
}, {
  signed: false,
  projectDirCreated: async projectDir => {
    await symlink(path.join(getFixtureDir(), "pkg-scripts"), path.join(projectDir, "build", "pkg-scripts"))
  },
  packed: async context => {
    const pkgPath = path.join(context.outDir, "Test App ßW-1.1.0.pkg")
    const fileList = pathSorter(parseFileList(await exec("pkgutil", ["--payload-files", pkgPath]), false))
    expect(fileList).toMatchSnapshot()

    const unpackedDir = path.join(context.outDir, "pkg-unpacked")
    await exec("pkgutil", ["--expand", pkgPath, unpackedDir])

    const info = parseXml(await readFile(path.join(unpackedDir, "Distribution"), "utf8"))
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
    await BluebirdPromise.all([
      assertThat(path.join(scriptDir, "postinstall")).isFile(),
      assertThat(path.join(scriptDir, "preinstall")).isFile(),
    ])
  }
}))

// todo failed on Travis CI
//test("tar.xz", createTargetTest(["tar.xz"], ["Test App ßW-1.1.0-mac.tar.xz"]))