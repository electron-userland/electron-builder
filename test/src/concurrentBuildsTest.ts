import { Arch, Configuration, DIR_TARGET, Platform } from "app-builder-lib"
import { deepAssign } from "builder-util"
import { TmpDir } from "temp-file"
import { assertPack, modifyPackageJson } from "./helpers/packTester.js"

const options = { timeout: 20 * 60 * 1000 }

const winTargets = Platform.WINDOWS.createTarget([DIR_TARGET, "nsis"], Arch.x64, Arch.arm64)
const macTargets = Platform.MAC.createTarget([DIR_TARGET, "zip", "dmg", "mas"], Arch.arm64, Arch.x64)
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

test.ifLinux("win/linux concurrent", options, ({ expect }) => {
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

test.ifMac("mac/win/linux concurrent", options, ({ expect }) => {
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

test.ifMac("mac concurrent", options, ({ expect }) => {
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

test.ifNotMac("win concurrent", options, ({ expect }) => {
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

test.ifNotWindows("linux concurrent", options, ({ expect }) => {
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

test.ifWindows("win concurrent - all targets", options, ({ expect }) => {
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
