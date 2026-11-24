import { Arch, Platform } from "electron-builder"
import { app, EXTENDED_TIMEOUT } from "../helpers/packTester.js"

// nsis.allowUnelevatedPerMachineUpdate adds code to the installer and the uninstaller behind !ifdef: both compile (makensis -WX) with
// the option off and on. nsisUnelevatedPerMachineUpdateTest.ts checks which code each configuration gets.

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
}
