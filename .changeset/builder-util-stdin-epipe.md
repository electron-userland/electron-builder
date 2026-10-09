---
"builder-util": patch
---

fix: handle EPIPE on child stdin in `spawnAndWrite` / `spawnAndWriteWithOutput` when the process exits before all input is written
