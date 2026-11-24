---
"builder-util": minor
---

feat(builder-util): `walk` takes an optional fourth argument, a `WalkSource` with `readdir(dir)` and `lstat(file)`, to walk a tree other than the file system (such as the files of an asar archive) with the same `filter` and `consumer`. Without it, `walk` reads the file system as before.
