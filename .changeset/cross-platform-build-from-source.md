---
"app-builder-lib": patch
---

fix: `nativeModules.buildDependenciesFromSource` no longer skips the native-dependency rebuild when the target platform differs from the host. The skip left whatever binary was already in `node_modules` (usually the host's) in the packaged app. Native modules cannot be cross-compiled from source, so for a cross-platform target `@electron/rebuild` now runs with prebuilt binaries for the target instead, and a warning is logged; a module with no prebuild for the target fails the rebuild instead of shipping the wrong binary.
