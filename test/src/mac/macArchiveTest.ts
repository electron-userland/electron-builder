import { app, createMacTargetTest, getFixtureDir, parseFileList } from "../helpers/packTester"
import { assertThat } from "../helpers/fileAssert"
import { Platform } from "electron-builder-core"
import { exec } from "electron-builder-util"
import * as path from "path"
import pathSorter from "path-sort"
import { readFile, symlink } from "fs-extra-p"
import { parseString } from "xml2js"
import BluebirdPromise from "bluebird-lst-c"

test.ifMac("invalid target", () => assertThat(createMacTargetTest([<any>"ttt"])()).throws("Unknown target: ttt"))

test("only zip", createMacTargetTest(["zip"]));

test("tar.gz", createMacTargetTest(["tar.gz"]))

const it = process.env.CSC_KEY_PASSWORD == null ? test.skip : test.ifMac

it("pkg", createMacTargetTest(["pkg"]))

it.ifMac("pkg scripts", app({
  targets: Platform.MAC.createTarget("pkg"),
}, {
  useTempDir: true,
  signed: false,
  projectDirCreated: async (projectDir) => {
    await symlink(path.join(getFixtureDir(), "pkg-scripts"), path.join(projectDir, "build", "pkg-scripts"))
  },
  packed: async (context) => {
    const macOutDir = context.getContent(Platform.MAC)
    const pkgPath = path.join(macOutDir, "Test App ßW-1.1.0.pkg")
    const fileList = pathSorter(parseFileList(await exec("pkgutil", ["--payload-files", pkgPath]), false))
    expect(fileList).toMatchSnapshot()

    const unpackedDir = path.join(macOutDir, "pkg-unpacked")
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