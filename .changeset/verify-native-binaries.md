---
"app-builder-lib": minor
---

fix: `nativeModules.buildDependenciesFromSource` no longer skips the native-dependency rebuild when the target platform differs from the host (which shipped the host's binary). Native modules cannot be cross-compiled from source, so such targets are now rebuilt with prebuilt binaries for the target and a warning is logged. feat: after packing (per slice for macOS universal, before the merge), every `.node` addon in `app.asar`, `app.asar.unpacked` or `app` is identified from its ELF / Mach-O / PE header and compared with the target platform/arch; a mismatch fails the build with the file, detected and expected target. Other mismatched native files (`.so`, `.dylib`, `.dll`, `.exe`) only warn, and files declared for another platform (`package.json` `os`/`cpu`, `prebuilds/<platform>-<arch>/` paths) are skipped. New opt-out option `nativeModules.verifyNativeBinaries?: boolean | "warn" | null` (`"warn"` logs only, `false` skips).
