---
"builder-util": patch
---

fix: decode child process output as UTF-8 across chunks. Before, a multi-byte character split between two pipe reads became `�` in `spawn` and `spawnAndWriteWithOutput` output and in `ExecError` messages, which could corrupt workspace paths, DMG mount paths and `makensis` output. After, split characters are decoded correctly.
