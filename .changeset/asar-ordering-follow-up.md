---
"app-builder-lib": patch
---

fix(asar): a missing `asar.ordering` file now fails with a configuration error naming the paths tried and the v27 migration notes, builds that apply an ordering file warn once that the option is now honored, ordering lines with `\` separators match on macOS and Linux, and lines naming a directory no longer count as missing in the coverage log
