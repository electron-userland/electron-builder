---
---

chore(tests): drop the test package's own `@electron/get` dependency (was `^3.1.0`, two majors behind `app-builder-lib`) so tests download Electron through `app-builder-lib`'s `downloadElectronArtifactZip` and always use its `@electron/get`
