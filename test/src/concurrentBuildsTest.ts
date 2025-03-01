import { Platform, DIR_TARGET, Arch, Configuration } from "app-builder-lib"
import { assertPack, modifyPackageJson } from "./helpers/packTester"
import { TmpDir } from "temp-file"
import { deepAssign } from "builder-util"

const winTargets = Platform.WINDOWS.createTarget([DIR_TARGET, "nsis"], Arch.x64, Arch.arm64)
// const winTargets = Platform.WINDOWS.createTarget([DIR_TARGET, "msi", "msi-wrapped", "nsis", "nsis-web"], Arch.x64, Arch.arm64)
const macTargets = Platform.MAC.createTarget([DIR_TARGET, "zip", "dmg", "mas"], Arch.x64, Arch.universal)
const linuxTargets = Platform.LINUX.createTarget([DIR_TARGET, "deb", "rpm", "AppImage"], Arch.x64, Arch.armv7l)

const config: Configuration = {
  productName: "Test Concurrent",
  appId: "test-concurrent",
  artifactName: "${productName}-${version}-${arch}.${ext}",
  compression: "store",
}
const projectDirCreated = async (projectDir: string, tmpDir: TmpDir) => {
  const buildConfig = (data: any, isApp: boolean) => {
    deepAssign(data, {
      name: "concurrent", // needs to be lowercase for fpm targets (can't use default fixture TestApp)
      version: "1.1.0",
      ...(!isApp ? { build: config } : {}), // build config is only allowed in "dev" (root) package.json in two-package.json setups
    })
  }
  await modifyPackageJson(
    projectDir,
    (data: any) => buildConfig(data, true),
    true
  )
  await modifyPackageJson(
    projectDir,
    (data: any) => buildConfig(data, false),
    false
  )
}

test.ifNotWindows("win/linux concurrent", () => {
  const targets = new Map([...winTargets, ...linuxTargets])
  return assertPack(
    "test-app",
    {
      targets,
      config,
    },
    {
      projectDirCreated,
    }
  )
})

test.ifMac("mac/win/linux concurrent", () => {
  const targets = new Map([...winTargets, ...macTargets, ...linuxTargets])
  return assertPack(
    "test-app",
    {
      targets,
      config
    },
    {
      projectDirCreated,
    }
  )
})

test.ifMac("mac concurrent", () => {
  const targets = macTargets
  return assertPack(
    "test-app",
    {
      targets,
      config
    },
    {
      projectDirCreated,
    }
  )
})

test.ifNotMac("win concurrent", () => {
  const targets = winTargets
  return assertPack(
    "test-app",
    {
      targets,
      config
    },
    {
      projectDirCreated,
    }
  )
})

test.ifNotWindows("linux concurrent", () => {
  const targets = linuxTargets
  return assertPack(
    "test-app",
    {
      targets,
      config
    },
    {
      projectDirCreated,
    }
  )
})

test.ifWindows("win concurrent - all targets", () => {
  const targetList = [DIR_TARGET, `appx`, `nsis`, `portable`, `squirrel`, `7z`, `zip`, `tar.xz`, `tar.gz`, `tar.bz2`]
  const targets = Platform.WINDOWS.createTarget(targetList, Arch.x64, Arch.arm64)
  return assertPack(
    "test-app",
    {
      targets,
      config: {
        ...config,
        win: { target: targetList },
      },
    },
    {
      projectDirCreated,
    }
  )
})
