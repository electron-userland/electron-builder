import { Platform } from "electron-builder"
import { app } from "../helpers/packTester.js"
import { canRunFlatpak } from "../updater/blackboxInstallLinux.js"

describe.heavy.ifEnv(canRunFlatpak())("Linux Flatpak Test", () => {
  test("flatpak", ({ expect }) =>
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
    }))

  // One build for both: on the Electron of the test app, useWaylandFlags adds no flags (see flatpakTest.ts), and finishArgs only
  // change the manifest, so the two have no interaction, and the build checks that flatpak-builder accepts both.
  test("enable Wayland flags and custom finishArgs", ({ expect }) =>
    app(expect, {
      targets: Platform.LINUX.createTarget("flatpak"),
      config: {
        flatpak: {
          useWaylandFlags: true,
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
    }))

  test("custom runtime and base app version", ({ expect }) =>
    app(expect, {
      targets: Platform.LINUX.createTarget("flatpak"),
      config: {
        flatpak: {
          runtimeVersion: "25.08",
          baseVersion: "25.08",
        },
      },
    }))

  // The linux.files regression tests are in flatpakTest.ts: the copy pairs they check are computed before the bundle is built.
})
