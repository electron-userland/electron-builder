import { execFileSync, execSync } from "child_process"
import { DebUpdater, PacmanUpdater, RpmUpdater } from "electron-updater"
import { writeFileSync } from "fs"
import path from "path"
import * as which from "which"

export function installLinux(target: string, dirPath: string): string {
  if (target === "AppImage") {
    return path.join(dirPath, `TestApp.AppImage`)
  }

  if (target === "deb") {
    DebUpdater.installWithCommandRunner(
      "dpkg",
      path.join(dirPath, `TestApp.deb`),
      commandWithArgs => {
        execSync(commandWithArgs.join(" "), { stdio: "inherit" })
      },
      console
    )
    return path.join("/opt", "TestApp", "TestApp")
  }

  if (target === "rpm") {
    RpmUpdater.installWithCommandRunner(
      "zypper",
      path.join(dirPath, `TestApp.rpm`),
      commandWithArgs => {
        execSync(commandWithArgs.join(" "), { stdio: "inherit" })
      },
      console
    )
    return path.join("/opt", "TestApp", "TestApp")
  }

  if (target === "pacman") {
    PacmanUpdater.installWithCommandRunner(
      path.join(dirPath, `TestApp.pacman`),
      commandWithArgs => {
        execSync(commandWithArgs.join(" "), { stdio: "inherit" })
      },
      console
    )
    return path.join("/opt", "TestApp", "TestApp")
  }

  throw new Error(`Unsupported Linux target: ${target}`)
}

export function cleanupLinux(target: string): void {
  if (target === "deb") {
    execSync("dpkg --purge testapp", { stdio: "inherit" })
  } else if (target === "rpm") {
    const pm = detectRpmPackageManager()
    if (pm === "zypper") {
      execSync("zypper remove -y testapp", { stdio: "inherit" })
    } else if (pm === "dnf") {
      execSync("dnf remove -y testapp", { stdio: "inherit" })
    } else if (pm === "yum") {
      execSync("yum remove -y testapp", { stdio: "inherit" })
    } else {
      execSync("rpm -e testapp", { stdio: "inherit" })
    }
  } else if (target === "pacman") {
    execSync("pacman -R --noconfirm testapp", { stdio: "inherit" })
  }
  // AppImage: standalone file, no system-wide install — nothing to uninstall
}

/**
 * Whether flatpak bundles can be built and run here. Having the tools is not enough: flatpak-builder mounts rofiles-fuse, and
 * `flatpak build-export` and `flatpak run` start bubblewrap, which has to create namespaces. An unprivileged container allows
 * neither, and the docker image that the Linux test shards run in includes flatpak, so the tools alone would not skip the tests there.
 *
 * Gates the flatpak case of this suite and test/src/linux/flatpak.e2e.ts. It lives in this helper module because a test file
 * cannot import another test file without also registering that file's tests.
 */
export function canRunFlatpak(): boolean {
  if (process.platform !== "linux" || which.sync("flatpak", { nothrow: true }) == null) {
    return false
  }
  try {
    execFileSync("bwrap", ["--ro-bind", "/", "/", "true"], { stdio: "ignore" })
    return true
  } catch {
    return false
  }
}

/**
 * Installs a single-file bundle for the current user. A flatpak has no executable on the host, so the returned
 * "app path" is a script that runs it. The app is started the way a user starts it, through its wrapper and zypak:
 * zypak launches Chromium's sandboxed processes through the flatpak portal, which needs a session bus.
 */
export function installFlatpak(bundlePath: string, appId: string): string {
  try {
    execSync(`flatpak install --user --bundle --noninteractive "${bundlePath}"`, { stdio: "inherit" })
    const launcherPath = path.join(path.dirname(bundlePath), "run-flatpak.sh")
    writeFileSync(launcherPath, `#!/bin/sh\nexec dbus-run-session -- flatpak run ${appId}\n`, { mode: 0o755 })
    return launcherPath
  } catch (e) {
    // the caller only cleans up after an install that returned, and a failed one can leave the app in the user's installation
    try {
      cleanupFlatpak(appId)
    } catch {
      // nothing was installed
    }
    throw e
  }
}

export function cleanupFlatpak(appId: string): void {
  execSync(`flatpak uninstall --user --noninteractive ${appId}`, { stdio: "inherit" })
}

function detectRpmPackageManager(): "zypper" | "dnf" | "yum" | "rpm" {
  for (const pm of ["zypper", "dnf", "yum"] as const) {
    try {
      execSync(`which ${pm}`, { stdio: "ignore" })
      return pm
    } catch {
      // not installed
    }
  }
  return "rpm"
}
