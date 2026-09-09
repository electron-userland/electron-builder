---
"app-builder-lib": minor
---

feat: restore `mac.sign.type` (removed in #9889 without a working replacement). An explicit `sign.type` now selects development certificates (`Mac Developer` / `Apple Development`) and embeds matching development provisioning profiles on any mac build flavor; the default is still derived from the target (`mas-dev` → `development`, otherwise `distribution`). A `mas` build with `sign.type: "development"` also skips the MAS `.pkg` installer, matching v26 behavior. Docs and the `migrate-schema` `type` → `sign.type` move now match the implementation.
