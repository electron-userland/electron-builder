---
"app-builder-lib": patch
---

fix(pnpm-collector): package the declared versions of nested dependencies with pnpm 11 and `node-linker=hoisted` by detecting the hoisted layout from disk and preferring an in-range copy over an out-of-range override, including when the app is a package in a hoisted pnpm workspace with no `node_modules` of its own (#10228)
