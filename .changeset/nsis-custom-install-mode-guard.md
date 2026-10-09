---
"app-builder-lib": major
---

fix(nsis): correct the `customInstallMode` macro guard casing in `multiUserUi.nsh`. The guard previously checked `!ifmacrodef customInstallmode` (lowercase `m`) while the documentation and the adjacent `!insertmacro customInstallMode` call use `customInstallMode`; it now checks `customInstallMode`, matching the documented macro name. Applications that define the macro with the documented casing now have it reliably applied on the install-mode page of assisted multi-user installers. Applications that defined the macro under the exact lowercase name `customInstallmode` relied on undocumented behavior — rename the definition in your custom NSIS scripts (e.g. `build/installer.nsh`) to `customInstallMode`.
