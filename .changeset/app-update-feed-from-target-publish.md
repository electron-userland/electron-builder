---
"app-builder-lib": minor
---

fix(publish): embed the auto-update feed of the targets that write update info into `app-update.yml`

`app-update.yml` was always built from the platform/top-level `publish`, ignoring target-level settings such as `nsis.publish`. With only a target-level publish, a build shipped either no `app-update.yml` (installs had no feed, and an updater pointed at one with `setFeedURL` had no trusted update-manifest key, so signature verification failed open with a warning) or, when `package.json` `repository` pointed at GitHub, a GitHub feed while the manifests were published elsewhere.

Each packaged app now embeds the first provider of the publish settings of its targets that emit a manifest (NSIS/NSIS web, AppX with `electronUpdaterAware`, macOS dmg/zip, AppImage, deb/rpm/pacman), resolving target, then platform, then top level. When none does (snap-only, or `publish: null` / `publishAutoUpdate: false` on the target), it falls back to the platform/top-level settings as before, including the GitHub fallback when nothing configures `publish`. The embedded trust list is unchanged.

**What changes in packages:** builds that set `publish` only (or differently) on a target now ship that target's feed and trust key in `app-update.yml`. AppImage and deb/rpm/pacman now honor `appImage.publish` / `deb.publish` etc. for the file they write as well. Builds without target-level `publish` produce the same file as before.

**New error:** if two targets built from the same app (e.g. `nsis` and an updater-aware `appx`, or macOS `dmg` and `zip`) resolve different first providers, the build fails with an `InvalidConfigurationError`, since one `app-update.yml` cannot point at both. Configure `publish` once at the platform level or make their first providers identical.

Released as a minor rather than a patch because it changes the contents of shipped packages for affected configurations and can fail builds whose targets disagree about the feed — both only for configurations whose auto-update feed was already wrong.
