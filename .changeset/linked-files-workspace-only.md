---
"app-builder-lib": major
---

fix!: a file of the app that is a symlink, or is reached through one, is packaged only when its real path is inside the workspace root, the project or app directory, or the package-manager store (pnpm `storeDir`/`virtualStoreDir` from `node_modules/.modules.yaml`). v26 refused only some system directories and allowed everything else, explicitly the home and temp directories, and checked only files packed into `app.asar`; v27 also checks `asar: false` builds. Workspace packages (#675) keep working; `npm link` or a `file:` dependency outside the workspace now fails with `InvalidConfigurationError` (code `ERR_ELECTRON_BUILDER_FILE_OUTSIDE_WORKSPACE`) — add the package to the workspace or install it from a tarball or the registry. See https://www.electron.build/docs/migration/v27-breaking-changes#linked-files-must-resolve-inside-the-workspace
