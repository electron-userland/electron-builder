import { Arch, Platform } from "electron-builder"
import { app, EXTENDED_TIMEOUT } from "../helpers/packTester.js"

// nsis.allowUnelevatedPerMachineUpdate adds probes to the installer's silent per-machine update path (installer.nsi) and to the
// uninstaller's per-machine mode (multiUser.nsh), each behind !ifdef. Compiling both, with the option off and on, covers both sides of
// each !ifdef: the assisted per-user installer gets the probes, the one-click per-machine uninstaller must not (ONE_CLICK gate).

for (const allowUnelevatedPerMachineUpdate of [false, true]) {
  const option = allowUnelevatedPerMachineUpdate ? "on" : "off"

  test(`assisted, perMachine false, allowUnelevatedPerMachineUpdate ${option}`, { timeout: EXTENDED_TIMEOUT }, ({ expect }) =>
    app(expect, {
      targets: Platform.WINDOWS.createTarget(["nsis"], Arch.x64),
      config: {
        nsis: {
          oneClick: false,
          perMachine: false,
          allowUnelevatedPerMachineUpdate,
        },
      },
    })
  )

  test(`one-click, perMachine true, allowUnelevatedPerMachineUpdate ${option}`, { timeout: EXTENDED_TIMEOUT }, ({ expect }) =>
    app(expect, {
      targets: Platform.WINDOWS.createTarget(["nsis"], Arch.x64),
      config: {
        nsis: {
          perMachine: true,
          allowUnelevatedPerMachineUpdate,
        },
      },
    })
  )
}
