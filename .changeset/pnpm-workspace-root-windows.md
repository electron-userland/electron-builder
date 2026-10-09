---
"app-builder-lib": patch
---

fix: resolve the pnpm workspace root by walking up for `pnpm-workspace.yaml` instead of running `pnpm --workspace-root exec pwd`. `pwd` is POSIX-only, so on Windows the root silently resolved to `undefined`, `@electron/rebuild` searched only the app directory, and cross-architecture builds (e.g. `--x64 --arm64`) shipped transitive native modules such as `keytar` for the wrong architecture. When a workspace root is located but the package manager cannot be re-detected there, the located root is now kept and a warning is logged instead of dropping it.
