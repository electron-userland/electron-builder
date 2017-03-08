import BluebirdPromise from "bluebird-lst"
import { Platform } from "electron-builder-core"
import { exec } from "electron-builder-util"
import { readFile, symlink } from "fs-extra-p"
import * as path from "path"
import pathSorter from "path-sort"
import { parseString } from "xml2js"
import { assertThat } from "../helpers/fileAssert"
import { app, createMacTargetTest, getFixtureDir, parseFileList } from "../helpers/packTester"

test.ifMac("invalid target", () => assertThat(createMacTargetTest([<any>"ttt"])()).throws())

test("only zip", createMacTargetTest(["zip"]));

test("tar.gz", createMacTargetTest(["tar.gz"]))

const it = process.env.CSC_KEY_PASSWORD == null ? test.skip : test.ifMac
it("pkg", createMacTargetTest(["pkg"]))

test.ifMac("pkg scripts", app({
  targets: Platform.MAC.createTarget("pkg"),
}, {
  signed: false,
  projectDirCreated: async (projectDir) => {
    await symlink(path.join(getFixtureDir(), "pkg-scripts"), path.join(projectDir, "build", "pkg-scripts"))
  },
  packed: async (context) => {
    const pkgPath = path.join(context.outDir, "Test App ßW-1.1.0.pkg")
    const fileList = pathSorter(parseFileList(await exec("pkgutil", ["--payload-files", pkgPath]), false))
    expect(fileList).toMatchSnapshot()

    const unpackedDir = path.join(context.outDir, "pkg-unpacked")
    await exec("pkgutil", ["--expand", pkgPath, unpackedDir])

    const m: any = BluebirdPromise.promisify(parseString)
    const info = await m(await readFile(path.join(unpackedDir, "Distribution"), "utf8"), {
      explicitRoot: false,
      explicitArray: false,
      mergeAttrs: true,
    })
    delete info["pkg-ref"][0]["bundle-version"].bundle.CFBundleVersion
    delete info.product.version

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