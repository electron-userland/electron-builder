---
"app-builder-lib": patch
---

fix: read `file:///` custom toolset URLs as file URLs. Before, `"url": "file:///C:/tools/nsis-bundle.zip"` (the form `pathToFileURL` gives on Windows) was looked up as `/C:/tools/nsis-bundle.zip` and rejected as an invalid custom toolset on Windows, and a percent-encoded character such as `%20` for a space was not decoded on any platform. After, both resolve to the local file or directory.
