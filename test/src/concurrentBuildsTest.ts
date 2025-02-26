import { Platform, DIR_TARGET, Arch } from "app-builder-lib"
import { assertPack, modifyPackageJson } from "./helpers/packTester"
import { TmpDir } from "temp-file"

const winTargets = Platform.WINDOWS.createTarget([DIR_TARGET, "nsis"], Arch.x64, Arch.arm64)
// const winTargets = Platform.WINDOWS.createTarget([DIR_TARGET, "msi", "msi-wrapped", "nsis", "nsis-web"], Arch.x64, Arch.arm64)
const macTargets = Platform.MAC.createTarget([DIR_TARGET, "zip", "dmg", "mas"], Arch.x64, Arch.universal)
const linuxTargets = Platform.LINUX.createTarget([DIR_TARGET, "deb", "rpm", "AppImage"], Arch.x64, Arch.arm64)

const jobConcurrency = 1

const projectDirCreated = async (projectDir: string, tmpDir: TmpDir) => {
  await modifyPackageJson(
    projectDir,
    (data: any) => ({
      ...data,
      name: "test-concurrent",
      version: "1.0.0",
      build: {
        artifactName: "${productName}-${version}-${arch}.${ext}",
      }
    }),
    true
  )
  await modifyPackageJson(
    projectDir,
    (data: any) => ({
      ...data,
      build: {
        artifactName: "${productName}-${version}-${arch}.${ext}",
      }
    }),
    false
  )
}

test.ifAll("win/linux concurrent", () => {
  const targets = new Map([...winTargets, ...linuxTargets])
  return assertPack(
    "test-app",
    {
      targets,
      config: {
        concurrency: {
          jobs: jobConcurrency,
        },
      },
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
      config: {
        concurrency: {
          jobs: jobConcurrency,
        },
      },
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
      config: {
        concurrency: {
          jobs: jobConcurrency,
        },
      },
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
      config: {
        concurrency: {
          jobs: jobConcurrency,
        },
      },
    },
    {
      projectDirCreated,
    }
  )
})

test.ifDevOrLinuxCi("linux concurrent", () => {
  const targets = linuxTargets
  return assertPack(
    "test-app",
    {
      targets,
      config: {
        concurrency: {
          jobs: jobConcurrency,
        },
      },
    },
    {
      projectDirCreated,
    }
  )
})

test.ifWindows("win concurrent - all targets", () => {
  const targets = Platform.WINDOWS.createTarget([DIR_TARGET, `appx`, `msi`, `msi-wrapped`, `squirrel`, `7z`, `zip`, `tar.xz`, `tar.lz`, `tar.gz`, `tar.bz2`], Arch.x64, Arch.arm64)
  return assertPack(
    "test-app",
    {
      targets,
      config: {
        concurrency: {
          jobs: jobConcurrency,
        },
      },
    },
    {
      projectDirCreated,
    }
  )
})
