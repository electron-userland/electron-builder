import { DebugLogger } from "builder-util"
import { log } from "builder-util/src/util"
import { Platform } from "electron-builder"
import { getLinuxVm } from "app-builder-lib/internal"
import { readdir } from "fs/promises"
import * as path from "path"
import { assertPack, EXTENDED_TIMEOUT } from "../helpers/packTester"
import { canSudoSnap, deliverAndInstallSnapInVm, installAndLaunchSnapLocally } from "../helpers/launchAppCrossPlatform"

const isEnabled = process.env.RUN_SNAP_TESTS === "true" && process.platform !== "win32"

const linuxVmPromise: Promise<Awaited<ReturnType<typeof getLinuxVm>>> =
  process.platform === "darwin" && isEnabled ? getLinuxVm(new DebugLogger(false)).catch(() => undefined) : Promise.resolve(undefined)

const vitestOptions = { sequential: true, timeout: EXTENDED_TIMEOUT }

// Run this command IN the Ubuntu VM terminal ($(whoami) expands to the VM user, e.g. "parallels").
// Grants passwordless sudo only for snap install/remove — no broader access.
const SUDO_SNAP_SETUP = 'echo "$(whoami) ALL=(root) NOPASSWD: /usr/bin/snap install *, /usr/bin/snap remove *" | sudo tee /etc/sudoers.d/eb-snap-test'

describe.heavy.ifEnv(isEnabled)("snap parallels vm", vitestOptions, () => {
  test("core24 snap installs and launches", vitestOptions, async context => {
    const { expect } = context

    // assertPack deletes its temp dir after the `packed` callback returns, so the snap file
    // must be consumed inside the callback — not after assertPack resolves.
    const buildAndInstall = async (onSnap: (snapPath: string, snapName: string) => Promise<void>) => {
      await assertPack(
        expect,
        "test-app-one",
        {
          targets: Platform.LINUX.createTarget("snap"),
          config: {
            productName: "TestApp",
            executableName: "TestApp",
            snapcraft: {
              base: "core24",
              core24: {
                useMultipass: process.platform === "darwin", // Multipass is required on macOS to build snaps for Linux, but on Linux we can build directly without it
              },
            },
          },
        },
        {
          packed: async ctx => {
            const entries = await readdir(ctx.outDir)
            const snap = entries.find(f => f.endsWith(".snap"))
            if (!snap) {
              throw new Error(`No .snap artifact found in ${ctx.outDir}`)
            }
            const snapPath = path.join(ctx.outDir, snap)
            const snapName = path.basename(snapPath, ".snap").split("_")[0]
            await onSnap(snapPath, snapName)
          },
        }
      )
    }

    let result: { version: string; snapPath: string; snapName: string }

    if (process.platform === "linux") {
      if (!canSudoSnap()) {
        console.warn(`skipping snap install test — passwordless sudo for snap not configured. Run: ${SUDO_SNAP_SETUP}`)
        context.skip()
        return
      }
      await buildAndInstall(async (snapPath, snapName) => {
        const { version } = await installAndLaunchSnapLocally(snapPath, { snapName, timeoutMs: 3 * 60 * 1000 })
        result = { version, snapPath, snapName }
      })
    } else {
      const vm = await linuxVmPromise
      if (!vm) {
        context.skip()
        return
      }
      // "snap install --help" matches NOPASSWD: /usr/bin/snap install * and is harmless.
      // We check the first output line: sudo denial begins with "sudo:", snap output does not.
      const vmSudoCheck = await vm.exec("bash", ["-c", 'out=$(sudo -n snap install --help 2>&1 | head -1); [[ "$out" == sudo:* ]] && echo SKIP || echo OK']).catch(() => "SKIP")
      if (!vmSudoCheck.includes("OK")) {
        console.warn(`skipping snap install test — VM passwordless sudo for snap not configured. On the VM run: ${SUDO_SNAP_SETUP}`)
        context.skip()
        return
      }
      await buildAndInstall(async (snapPath, snapName) => {
        const { version } = await deliverAndInstallSnapInVm(vm, snapPath, { snapName, timeoutMs: 3 * 60 * 1000 })
        result = { version, snapPath, snapName }
      })
    }

    log.info(result!, "snap launched successfully")
    expect(result!.version).toBeTruthy()
  })
})
