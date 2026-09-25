---
"electron-updater": minor
---

feat(updater): add `allowUnverifiedLinuxPackages` to optionally enforce Linux package signature verification

Adds `AppUpdater.allowUnverifiedLinuxPackages`. Because electron-builder does not sign Linux packages, this defaults to `true`, preserving the existing behavior: `.deb`/`.rpm` auto-updates install with the package manager's signature/GPG checks bypassed where a bypass flag exists (`--allow-unauthenticated` for the apt fallback, `--allow-unsigned-rpm` for zypper, `--nogpgcheck` for dnf/yum).

If you sign your Linux packages through your own pipeline and the target systems trust your keys, set `autoUpdater.allowUnverifiedLinuxPackages = false`. What this enforces depends on the package manager used on the target system:

- dpkg (the default for `.deb`): no effect — dpkg performs no signature verification (a warning is logged); enforcing `.deb` signatures requires a debsig-verify/debsigs policy on the target system.
- apt (`.deb` fallback): `--allow-unauthenticated` is omitted.
- zypper: enforced — unsigned/untrusted packages fail to install.
- dnf/yum: enforced via `--setopt=localpkg_gpgcheck=1` (local package files are not GPG-checked by default).
- bare rpm (fallback): cannot be enforced via the CLI (a warning is logged) — rpm verifies signatures when present but by default does not fail the install on unsigned/untrusted packages; the `rpm -Uvh ... --nodeps` fallback command is unchanged (`--nodeps` is a dependency-resolution bypass, not a signature bypass).

The new `allowUnverified` parameter on `DebUpdater.installWithCommandRunner` / `RpmUpdater.installWithCommandRunner` is a trailing optional argument (default `true`), so existing callers remain source- and runtime-compatible.
