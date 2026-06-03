import { execSync } from "child_process"
import { DebUpdater, PacmanUpdater, RpmUpdater } from "electron-updater"
import path from "path"

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
