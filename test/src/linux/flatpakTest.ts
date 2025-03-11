import { Platform } from "electron-builder"
import { app } from "../helpers/packTester"

test.ifDevOrLinuxCi("flatpak", ({ expect }) =>
  app(expect, {
    targets: Platform.LINUX.createTarget("flatpak"),
    config: {
      electronFuses: {
        runAsNode: true,
        enableCookieEncryption: true,
        enableNodeOptionsEnvironmentVariable: true,
        enableNodeCliInspectArguments: true,
        enableEmbeddedAsarIntegrityValidation: true,
        onlyLoadAppFromAsar: true,
        loadBrowserProcessSpecificV8Snapshot: true,
        grantFileProtocolExtraPrivileges: undefined, // unsupported on current electron version in our tests
      },
    },
  })
)

test.ifDevOrLinuxCi("enable Wayland flags", ({ expect }) =>
  app(expect, {
    targets: Platform.LINUX.createTarget("flatpak"),
    config: {
      flatpak: {
        useWaylandFlags: true,
      },
    },
  })
)

test.ifDevOrLinuxCi("custom finishArgs", ({ expect }) =>
  app(expect, {
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

test.ifDevOrLinuxCi("custom runtime and base app version", ({ expect }) =>
  app(expect, {
    targets: Platform.LINUX.createTarget("flatpak"),
    config: {
      flatpak: {
        runtimeVersion: "19.08",
        baseVersion: "19.08",
      },
    },
  })
)
