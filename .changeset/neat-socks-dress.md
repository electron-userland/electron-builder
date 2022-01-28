---
"electron-updater": patch
---

- Removed backtick escaping for Windows code signing as it is unnecessary for Powershell and can cause the script to attempt to access the wrong file
- Updated the proxy filename to be more secure (512-bit string)
