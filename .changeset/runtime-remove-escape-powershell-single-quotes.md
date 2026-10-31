---
"builder-util-runtime": major
---

refactor(win)!: remove the `escapePowerShellSingleQuotes` export, which only shipped in 10.0.0-alpha.11; the Authenticode check passes the file path to PowerShell in an environment variable (`prepareAuthenticodeSignatureExec`), so no path is quoted into a PowerShell script.
