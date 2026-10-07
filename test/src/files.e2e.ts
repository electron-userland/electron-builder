import { archFromString } from "builder-util"
import { Platform } from "electron-builder"
import fsExtra from "fs-extra"
import * as path from "path"
import { assertThat } from "./helpers/fileAssert.js"
import { assertPack } from "./helpers/packTester.js"
import { ExpectStatic } from "vitest"

// Squirrel.Windows counterpart of filesTest.ts "extraResources on Linux/macOS": builds the squirrel target (nuget pack +
// Squirrel.exe releasify under wine) so the harness snapshots the -full.nupkg listing and .nuspec — the only Linux-side
// check that extraResources end up inside the NuGet payload.
async function doExtraResourcesTest(expect: ExpectStatic, platform: Platform) {
  const osName = platform.buildConfigurationKey
  await assertPack(
    expect,
    "test-app-one",
    {
      // to check NuGet package
      targets: platform.createTarget("squirrel"),
      config: {
        extraResources: ["foo", "bar/hello.txt", "./dir-relative/f.txt", "bar/${arch}.txt", "${os}/${arch}.txt"],
        [osName]: {
          extraResources: ["platformSpecificR"],
          extraFiles: ["platformSpecificF"],
        },
      },
    },
    {
      projectDirCreated: async projectDir => {
        return Promise.all([
          fsExtra.outputFile(path.resolve(projectDir, "foo/nameWithoutDot"), "nameWithoutDot"),
          fsExtra.outputFile(path.resolve(projectDir, "bar/hello.txt"), "data"),
          fsExtra.outputFile(path.resolve(projectDir, "dir-relative/f.txt"), "data"),
          fsExtra.outputFile(path.resolve(projectDir, `bar/${process.arch}.txt`), "data"),
          fsExtra.outputFile(path.resolve(projectDir, `${osName}/${process.arch}.txt`), "data"),
          fsExtra.outputFile(path.resolve(projectDir, "platformSpecificR"), "platformSpecificR"),
          fsExtra.outputFile(path.resolve(projectDir, "ignoreMe.txt"), "ignoreMe"),
        ])
      },
      packed: async context => {
        const resourcesDir = context.getResources(platform, archFromString(process.arch))
        return Promise.all([
          assertThat(expect, path.resolve(resourcesDir, "foo")).isDirectory(),
          assertThat(expect, path.resolve(resourcesDir, "foo", "nameWithoutDot")).isFile(),
          assertThat(expect, path.resolve(resourcesDir, "bar", "hello.txt")).isFile(),
          assertThat(expect, path.resolve(resourcesDir, "dir-relative", "f.txt")).isFile(),
          assertThat(expect, path.resolve(resourcesDir, "bar", `${process.arch}.txt`)).isFile(),
          assertThat(expect, path.resolve(resourcesDir, osName, `${process.arch}.txt`)).isFile(),
          assertThat(expect, path.resolve(resourcesDir, "platformSpecificR")).isFile(),
          assertThat(expect, path.resolve(resourcesDir, "ignoreMe.txt")).doesNotExist(),
        ])
      },
    }
  )
}

// wine arm64 currently throws a native crash when running the test, so we skip on arm64 for now
test.ifLinux.ifEnv(process.arch !== "arm64")("extraResources on Windows", ({ expect }) => doExtraResourcesTest(expect, Platform.WINDOWS))
