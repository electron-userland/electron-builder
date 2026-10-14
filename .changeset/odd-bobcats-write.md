---
"app-builder-lib": minor
---

feat(flatpak): new options to customize the `flatpak-bundler` build

- `extraFlatpakBuilderArgs`: extra arguments to pass to `flatpak-builder`
- `extraFlatpakBuildExportArgs`: extra arguments to pass to `flatpak build-export`
- `autoInstallRuntime`, `autoInstallSdk`, `autoInstallBase`: set to `false` to skip installing/updating the runtime, SDK or base app from their remotes during the build (default `true`)
