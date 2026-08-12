---
"app-builder-lib": patch
---

fix: report the repository detected for `app-update.yml` at build time

When a GitHub or Bitbucket publish configuration omits `owner`/`repo`, electron-builder fills them in from the repository info (`package.json` `repository`, CI env vars, then `.git/config`) and writes the result into `app-update.yml` inside the packaged app, where it becomes the update feed for every installed copy. Until now nothing in the build output said which repository had been chosen - not even at `DEBUG=electron-builder`, which logged the pre-resolution `owner=undefined project=undefined`.

The build now logs the resolved `provider`/`owner`/`repo` once per build. Nothing about what gets written to `app-update.yml` changes, and builds that already specify `owner`/`repo` explicitly are unaffected.
