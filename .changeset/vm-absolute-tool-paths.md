---
"app-builder-lib": patch
"electron-builder": patch
"builder-util-runtime": patch
---

Start system tools by absolute path instead of looking them up on `PATH`: Windows PowerShell from `%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe` (for Windows code signing, package-manager commands and `create-self-signed-cert`), PowerShell 7 from `%ProgramFiles%\PowerShell\7\pwsh.exe` on Windows and from the install location of Microsoft's package on macOS and Linux, `prlctl` from the Parallels Desktop install location, and the host Wine (`toolsets.wine: "system"`, the default) from its fixed install locations. `SystemRoot` and `ProgramFiles` must be drive-absolute paths.
