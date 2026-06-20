import { Arch, Configuration, DIR_TARGET, Platform } from "app-builder-lib"
import { deepAssign } from "builder-util-runtime"
import * as fs from "fs/promises"
import * as path from "path"
import { TmpDir } from "temp-file"
import { archiveContains } from "./helpers/archiveHelper.js"
import { assertThat } from "./helpers/fileAssert.js"
import { assertPack, modifyPackageJson } from "./helpers/packTester.js"

const options = { timeout: 30 * 60 * 1000 }

const winTargets = Platform.WINDOWS.createTarget([DIR_TARGET, "nsis"], Arch.x64, Arch.arm64)
const macTargets = Platform.MAC.createTarget([DIR_TARGET, "zip", "mas"], Arch.arm64, Arch.x64)
const linuxTargets = Platform.LINUX.createTarget([DIR_TARGET, "AppImage"], Arch.x64, Arch.armv7l)

const config: Configuration = {
  productName: "Test Concurrent",
  appId: "test-concurrent",
  artifactName: "${productName}-${version}-${arch}.${ext}",
  compression: "store",
}
const projectDirCreated = async (projectDir: string, _tmpDir: TmpDir) => {
  const buildConfig = (data: any, isApp: boolean) => {
    deepAssign(data, {
      name: "concurrent", // needs to be lowercase for fpm targets (can't use default fixture TestApp)
      version: "1.1.0",
      ...(!isApp ? { build: config } : {}), // build config is only allowed in "dev" (root) package.json in two-package.json setups
    })
  }
  await modifyPackageJson(projectDir, (data: any) => buildConfig(data, true), true)
  await modifyPackageJson(projectDir, (data: any) => buildConfig(data, false), false)
}

test.heavy.ifLinux("win/linux concurrent", options, ({ expect }) => {
  const targets = new Map([...winTargets, ...linuxTargets])
  return assertPack(
    expect,
    "test-app",
    {
      targets,
      config: {
        concurrency: {
          jobs: Object.keys(targets).length,
        },
        ...config,
      },
    },
    {
      projectDirCreated,
    }
  )
})

test.heavy.ifMac("mac/win/linux concurrent", options, ({ expect }) => {
  const targets = new Map([...winTargets, ...macTargets, ...linuxTargets])
  return assertPack(
    expect,
    "test-app",
    {
      targets,
      config: {
        concurrency: {
          jobs: Object.keys(targets).length,
        },
        ...config,
      },
    },
    {
      projectDirCreated,
    }
  )
})

test.heavy.ifMac("mac concurrent", options, ({ expect }) => {
  const targets = macTargets
  return assertPack(
    expect,
    "test-app",
    {
      targets,
      config: {
        concurrency: {
          jobs: Object.keys(targets).length,
        },
        ...config,
      },
    },
    {
      projectDirCreated,
    }
  )
})

test.heavy.ifNotMac("win concurrent", options, ({ expect }) => {
  const targets = winTargets
  return assertPack(
    expect,
    "test-app",
    {
      targets,
      config: {
        concurrency: {
          jobs: Object.keys(targets).length,
        },
        ...config,
      },
    },
    {
      projectDirCreated,
    }
  )
})

test.heavy.ifNotWindows("linux concurrent", options, ({ expect }) => {
  const targets = Platform.LINUX.createTarget([DIR_TARGET, "rpm", "AppImage"], Arch.x64, Arch.armv7l)
  return assertPack(
    expect,
    "test-app",
    {
      targets,
      config: {
        concurrency: {
          jobs: Object.keys(targets).length,
        },
        ...config,
      },
    },
    {
      projectDirCreated,
    }
  )
})

test.heavy.ifWindows("win concurrent - all targets", options, ({ expect }) => {
  const targetList = [DIR_TARGET, `appx`, `nsis`, `portable`, `squirrel`, `7z`, `zip`, `tar.xz`, `tar.gz`, `tar.bz2`]
  const targets = Platform.WINDOWS.createTarget(targetList, Arch.x64, Arch.arm64)
  return assertPack(
    expect,
    "test-app",
    {
      targets,
      config: {
        concurrency: {
          jobs: Object.keys(targets).length,
        },
        win: { target: targetList },
        ...config,
      },
    },
    {
      projectDirCreated,
    }
  )
})

// Regression test for #9852: elevate.exe must reach the dir-target output (win-unpacked/resources)
// without leaking into a sibling target (here: zip) that packages the same appOutDir concurrently.
// The NSIS target injects elevate.exe into its own archive and defers the win-unpacked copy until
// all targets have finished reading appOutDir, so the zip — built concurrently — never captures it.
// `perMachine` forces `packElevateHelper` on. Runs on all platforms — the NSIS app archive is built
// natively and these are file-level assertions (no wine/install needed).
test.heavy("nsis + zip concurrent: elevate.exe reaches win-unpacked but never leaks into sibling targets (#9852)", options, ({ expect }) => {
  const elevateTargets = [DIR_TARGET, "nsis", "zip"]
  const targets = Platform.WINDOWS.createTarget(elevateTargets, Arch.x64)
  return assertPack(
    expect,
    "test-app",
    {
      targets,
      config: {
        ...config,
        concurrency: { jobs: Object.keys(targets).length },
        win: { target: elevateTargets },
        nsis: { perMachine: true },
      },
    },
    {
      projectDirCreated,
      packed: async context => {
        // The dir-target output keeps elevate.exe (written after every target finished with appOutDir).
        await assertThat(expect, path.join(context.getResources(Platform.WINDOWS, Arch.x64), "elevate.exe")).isFile()

        // The concurrently-built zip (which packages the same appOutDir) must NOT contain it.
        const zipFile = (await fs.readdir(context.outDir)).find(f => f.endsWith(".zip"))
        expect(zipFile, "expected a .zip artifact to be produced").toBeTruthy()
        expect(await archiveContains(path.join(context.outDir, zipFile!), "resources/elevate.exe")).toBe(false)
      },
    }
  )
})
