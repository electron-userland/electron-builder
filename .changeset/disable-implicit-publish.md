---
"app-builder-lib": major
---

fix: disable implicit publishing by default

BREAKING CHANGE: Publishing no longer happens automatically based on CI environment, git tags, or npm lifecycle events. You must now explicitly request publishing using the `--publish` CLI flag (e.g., `--publish always`, `--publish onTag`) or by setting the `publish` option in your configuration.

This addresses security and usability concerns where unexpected auto-publishing could accidentally expose secrets or publish unfinished work.

Fixes electron-userland/electron-builder#5463
