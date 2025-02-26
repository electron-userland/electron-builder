import { Platform, DIR_TARGET, Arch } from "app-builder-lib"
import path from "path"
import { toSystemIndependentPath, packageJson, app } from "./helpers/packTester"
import { verifySmartUnpack } from "./helpers/verifySmartUnpack"
import { MAX_FILE_REQUESTS } from "builder-util/out/fs"

const winTargets = Platform.WINDOWS.createTarget([DIR_TARGET, "nsis"], Arch.x64, Arch.arm64)
// const winTargets = Platform.WINDOWS.createTarget([DIR_TARGET, "msi", "msi-wrapped", "nsis", "nsis-web"], Arch.x64, Arch.arm64)
const macTargets = Platform.MAC.createTarget([DIR_TARGET, "zip", "pkg", "dmg"], Arch.x64, Arch.universal)
const linuxTargets = Platform.LINUX.createTarget([DIR_TARGET, "deb", "rpm", "AppImage"], Arch.x64, Arch.arm64)

test.ifAll("win/linux concurrent", () => {
  const targets = new Map([...winTargets, ...linuxTargets])
  return app(
    {
      targets,
      config: {
        concurrency: {
          jobs: MAX_FILE_REQUESTS,
        },
      },
    },
    {
      packed: async context => {
        // await verifySmartUnpack(context.getResources(Platform.WINDOWS))
      },
    }
  )()
})

test.ifMac("mac concurrent", () => {
  const targets = new Map([...winTargets, ...macTargets, ...linuxTargets])
  return app(
    {
      targets,
      config: {
        concurrency: {
          jobs: MAX_FILE_REQUESTS,
        },
      },
    },
    {
      packed: async context => {
        // await verifySmartUnpack(context.getResources(Platform.WINDOWS))
      },
    }
  )()
})

test.ifNotMac("win concurrent", () => {
  const targets = winTargets
  return app(
    {
      targets,
      config: {
        concurrency: {
          jobs: MAX_FILE_REQUESTS,
        },
      },
    },
    {
      packed: async context => {
        // await verifySmartUnpack(context.getResources(Platform.WINDOWS))
      },
    }
  )()
})

test.ifDevOrLinuxCi("linux concurrent", () => {
  const targets = winTargets
  return app(
    {
      targets,
      config: {
        concurrency: {
          jobs: MAX_FILE_REQUESTS,
        },
      },
    },
    {
      packed: async context => {
        // await verifySmartUnpack(context.getResources(Platform.LINUX))
      },
    }
  )()
})

test.ifWindows("win concurrent", () => {
  const targets = Platform.WINDOWS.createTarget([DIR_TARGET, `appx`, `msi`, `msi-wrapped`, `squirrel`, `7z`, `zip`, `tar.xz`, `tar.lz`, `tar.gz`, `tar.bz2`], Arch.x64, Arch.arm64)
  return app(
    {
      targets,
      config: {
        concurrency: {
          jobs: MAX_FILE_REQUESTS,
        },
      },
    },
    {
      packed: async context => {
        // await verifySmartUnpack(context.getResources(Platform.WINDOWS))
      },
    }
  )()
})
