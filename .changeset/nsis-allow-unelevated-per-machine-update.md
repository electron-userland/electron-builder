---
"app-builder-lib": minor
---

feat(nsis): add `nsis.allowUnelevatedPerMachineUpdate` (off by default). For an assisted installer without `perMachine`, a silent update of a per-machine installation skips the UAC prompt only when the installed version was built with the option too and the user already holds every right the update uses: on the installation folder, its files and its parent, the `HKLM` install and Uninstall keys and their parent keys, and the all-users shortcuts. The installer and uninstaller check these rights without writing anything, and elevate as before when one is missing, when a per-user installation exists too, or for an interactive install or uninstall. Setting the option for a one-click or `perMachine` installer is a configuration error.
