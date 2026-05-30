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
  // TODO: proper uninstall logic not yet implemented for deb/rpm — doesn't block CI
  if (target === "pacman") {
    execSync(`pacman -R --noconfirm testapp`, { stdio: "inherit" })
  }
}
