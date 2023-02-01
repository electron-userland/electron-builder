import { Platform } from "electron-builder"
import { app } from "../helpers/packTester"

if (process.env.FLATPAK_TEST === "false") {
  fit("Skip flatpakTest suite — FLATPAK_TEST is set to false or Windows", () => {
    console.warn("[SKIP] Skip flatpakTest suite — FLATPAK_TEST is set to false")
  })
} else if (process.platform === "win32") {
  fit("Skip flatpakTest suite — Windows is not supported", () => {
    console.warn("[SKIP] Skip flatpakTest suite — Windows is not supported")
  })
}

test.ifAll.ifDevOrLinuxCi(
  "flatpak",
  app({
    targets: Platform.LINUX.createTarget("flatpak"),
  })
)

test.ifAll.ifDevOrLinuxCi(
  "enable Wayland flags",
  app({
    targets: Platform.LINUX.createTarget("flatpak"),
    config: {
      flatpak: {
        useWaylandFlags: true,
      },
    },
  })
)

test.ifAll.ifDevOrLinuxCi(
  "custom finishArgs",
  app({
    targets: Platform.LINUX.createTarget("flatpak"),
    config: {
      flatpak: {
        finishArgs: [
          // Wayland
          "--socket=wayland",
          "--share=ipc",
          // Open GL
          "--device=dri",
          // Audio output
          "--socket=pulseaudio",
          // Allow communication with network
          "--share=network",
          // System notifications with libnotify
          "--talk-name=org.freedesktop.Notifications",
        ],
      },
    },
  })
)

test.ifAll.ifDevOrLinuxCi(
  "custom runtime and base app version",
  app({
    targets: Platform.LINUX.createTarget("flatpak"),
    config: {
      flatpak: {
        runtimeVersion: "19.08",
        baseVersion: "19.08",
      },
    },
  })
)
