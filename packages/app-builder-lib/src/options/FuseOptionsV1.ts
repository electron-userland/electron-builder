import type { FuseV1Options } from "@electron/fuses"

/**
 * Feature flags ("fuses") baked into the Electron binary at build time.
 *
 * All options map 1:1 to the flags documented by
 * [`@electron/fuses`](https://github.com/electron/fuses) and the upstream
 * [Electron fuses guide](https://www.electronjs.org/docs/latest/tutorial/fuses).
 *
 * electron-builder flips fuses after packaging and **before** signing so that the final
 * code signature covers the modified binary. On Apple Silicon, the ad-hoc signature is
 * re-applied automatically after flipping fuses.
 */

export interface FuseOptionsV1 extends Partial<Record<Uncapitalize<keyof typeof FuseV1Options>, boolean>> {
  /**
   * Controls whether the `ELECTRON_RUN_AS_NODE` environment variable is respected.
   *
   * When `true` (the Electron default), setting `ELECTRON_RUN_AS_NODE=1` in the environment
   * makes Electron behave like a plain Node.js process, bypassing the app entirely. Disable
   * this fuse in production apps to prevent that escape path.
   *
   * **Note:** Disabling this fuse also breaks `process.fork()` in the main process because
   * it relies on `ELECTRON_RUN_AS_NODE` internally. Use
   * [Utility Processes](https://www.electronjs.org/docs/latest/api/utility-process) as a
   * replacement.
   *
   * @see https://github.com/electron/fuses
   */
  runAsNode?: boolean

  /**
   * Controls whether the Chromium cookie store is encrypted using OS-level cryptography keys.
   *
   * When enabled, cookies are stored encrypted on disk (the same mechanism Chrome uses).
   * **This is a one-way transition**: existing unencrypted cookies are re-encrypted on write, but
   * disabling the fuse afterwards will leave the cookie database unreadable.
   *
   * Most production apps can safely enable this fuse.
   *
   * @see https://github.com/electron/fuses
   */
  enableCookieEncryption?: boolean

  /**
   * Controls whether the [`NODE_OPTIONS`](https://nodejs.org/api/cli.html#node_optionsoptions)
   * and `NODE_EXTRA_CA_CERTS` environment variables are respected.
   *
   * `NODE_OPTIONS` allows injecting arbitrary Node.js runtime flags (e.g. `--require`) and is
   * rarely needed in production. Most apps can safely disable this fuse.
   *
   * @see https://github.com/electron/fuses
   */
  enableNodeOptionsEnvironmentVariable?: boolean

  /**
   * Controls whether the `--inspect`, `--inspect-brk`, and related Node.js debugger flags are
   * honoured.
   *
   * When disabled, `SIGUSR1` no longer opens the V8 inspector in the main process either.
   * Most production apps can safely disable this fuse.
   *
   * @see https://github.com/electron/fuses
   */
  enableNodeCliInspectArguments?: boolean

  /**
   * Enables ASAR integrity validation — Electron verifies the embedded SHA-256 hash of
   * `app.asar` before loading it.
   *
   * Platform support:
   * - macOS: Electron ≥ 16.0.0
   * - Windows: Electron ≥ 30.0.0
   *
   * For this fuse to be meaningful, `asar.disableIntegrity` must **not** be
   * `true` (otherwise the hash is not embedded).
   *
   * @see https://www.electronjs.org/docs/latest/tutorial/asar-integrity
   */
  enableEmbeddedAsarIntegrityValidation?: boolean

  /**
   * When enabled, Electron searches for the app exclusively in `app.asar`, skipping the `app`
   * directory and `default_app.asar` fallbacks.
   *
   * Combined with `enableEmbeddedAsarIntegrityValidation`, this makes it impossible to side-load
   * unverified code by replacing `app.asar` with an unarchived `app/` directory.
   *
   * @see https://github.com/electron/fuses
   */
  onlyLoadAppFromAsar?: boolean

  /**
   * When enabled, the browser (main) process uses a separate V8 snapshot file
   * (`browser_v8_context_snapshot.bin`) instead of the shared one.
   *
   * This is only useful when you ship a custom V8 snapshot for the main process that differs
   * from the renderer snapshot. Standard apps do not need this.
   *
   * @see https://github.com/electron/fuses
   */
  loadBrowserProcessSpecificV8Snapshot?: boolean

  /**
   * Controls whether pages loaded from the `file://` protocol receive elevated privileges
   * beyond what a standard web browser would grant.
   *
   * These extra privileges include `fetch` to other `file://` URLs, service workers, and
   * universal frame access for child frames also on `file://`. This behaviour pre-dates modern
   * Electron security best practices.
   *
   * Disable this fuse if your app does not load content directly from `file://` (i.e. you use
   * a [custom protocol](https://www.electronjs.org/docs/latest/tutorial/security#18-avoid-usage-of-the-file-protocol-and-prefer-usage-of-custom-protocols)).
   *
   * @see https://github.com/electron/fuses
   */
  grantFileProtocolExtraPrivileges?: boolean

  /**
   * Enables V8 signal-based trap handlers for out-of-bounds WebAssembly memory accesses.
   *
   * When enabled, Electron uses OS signals (e.g. `SIGSEGV` on Linux/macOS) to catch Wasm
   * OOB accesses at the hardware level rather than inserting explicit bounds checks in JIT'd
   * code. This improves Wasm performance and is enabled by default in Electron.
   *
   * Disable only if the host environment restricts signal handlers (e.g. certain sandboxing
   * configurations) and you observe crashes in Wasm-heavy workloads.
   *
   * @see https://github.com/electron/fuses
   */
  wasmTrapHandlers?: boolean

  /**
   * Re-applies the ad-hoc codesignature on macOS after fuses are flipped.
   *
   * electron-builder already re-signs the app after flipping fuses, so this flag is
   * generally not needed and exists only as a compatibility shim for edge cases.
   *
   * @see https://github.com/electron/fuses?tab=readme-ov-file#apple-silicon
   */
  resetAdHocDarwinSignature?: boolean
}
// Compile-time exhaustiveness guard (no runtime output — pure type).
// When @electron/fuses adds a new FuseV1Options entry, the Exclude below becomes non-never,
// the conditional resolves to the tuple, and TypeScript errors with the name of the missing key(s).
type _AssertTrue<T extends true> = T
export type _FuseOptionsV1Exhaustive = _AssertTrue<
  [Exclude<Uncapitalize<keyof typeof FuseV1Options>, keyof FuseOptionsV1>] extends [never]
    ? true
    : ["FuseOptionsV1 is missing documented key(s) — add them with JSDoc above", Exclude<Uncapitalize<keyof typeof FuseV1Options>, keyof FuseOptionsV1>]
>
