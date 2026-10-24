---
"app-builder-lib": patch
---

Start the system tools used for Windows code signing and Parallels VMs by absolute path instead of looking them up on `PATH`: Windows PowerShell from `%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe`, PowerShell 7 from `%ProgramFiles%\PowerShell\7\pwsh.exe` on Windows and from the install location of Microsoft's package on macOS and Linux, and `prlctl` from the Parallels Desktop install location. `SystemRoot` and `ProgramFiles` must be drive-absolute paths.
