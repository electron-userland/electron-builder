---
"app-builder-lib": patch
---

fix: report the repository detected for `app-update.yml` at build time

When a GitHub or Bitbucket publish configuration omits `owner`/`repo`, electron-builder fills them in from the repository info (`package.json` `repository`, CI env vars, then `.git/config`) and writes the result into `app-update.yml` inside the packaged app, where it becomes the update feed for every installed copy. Until now nothing in the build output said which repository had been chosen - not even at `DEBUG=electron-builder`, which logged the pre-resolution `owner=undefined project=undefined`.

The build now logs the resolved `provider`/`owner`/`repo` (or `slug` for Bitbucket) once per build, together with the `source` the repository was detected from. A repository taken from the `package.json` `repository` field is deliberate configuration and is reported at info level; one picked up from CI environment variables or `.git/config` is reported at warn level. Nothing about what gets written to `app-update.yml` changes, and builds that already specify `owner`/`repo` explicitly are unaffected.
