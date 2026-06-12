---
"app-builder-lib": patch
---

fix(asar): pin `@electron/asar` to `4.1.1` to avoid embedded ASAR integrity corruption

`@electron/asar` `>= 4.1.2` computes a packed file's embedded integrity from `fs.readFileSync(<destination path>)` instead of the stream being packed. With electron-builder's stream-based packing the destination path is resolved against the process CWD, so when the CWD contains a file at the same relative path (e.g. `package.json`, `node_modules/<dep>/…`) the header records the integrity of the wrong file while the archive stores the correct bytes. Apps built with `enableEmbeddedAsarIntegrityValidation` then fail to launch (Electron rejects `app.asar`). Pinned to the last release that hashes the stream content.
