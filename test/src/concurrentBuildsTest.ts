import { Platform, DIR_TARGET, Arch, Configuration } from "app-builder-lib"
import { assertPack, modifyPackageJson } from "./helpers/packTester"
import { TmpDir } from "temp-file"

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
  const buildConfig = (data: any) => ({
    ...data,
    name: "test-concurrent", // needs to be lowercase for fpm targets
    version: "1.0.0",
    build: {   ...data.build, ...config},
  })
  await modifyPackageJson(
    projectDir,
    (data: any) => data = buildConfig(data),
    true
  )
  await modifyPackageJson(
    projectDir,
    (data: any) => data = buildConfig(data),
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
