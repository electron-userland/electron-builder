---
"app-builder-lib": patch
---

fix: don't bundle workspace node_modules when the app has no production dependencies

Before: packaging an app that declares zero production dependencies (e.g. everything is bundled by a JS bundler) from inside a monorepo skipped the app's own empty `node_modules`, climbed to the workspace root, and copied the entire hoisted workspace `node_modules` into `app.asar`.

After: an app with no production dependencies (neither in its `package.json` nor added via `extraMetadata`) bundles no `node_modules` at all — the collection step is skipped with an informational log message.
