---
"electron-updater": minor
---

feat(updater): add `allowUnverifiedLinuxPackages` to optionally enforce Linux package signature verification

Adds `AppUpdater.allowUnverifiedLinuxPackages`. Because electron-builder does not sign Linux packages, this defaults to `true`, preserving the existing behavior: `.deb`/`.rpm` auto-updates install with the package manager's signature/GPG checks bypassed (`--allow-unauthenticated` for apt, `--allow-unsigned-rpm` for zypper, `--nogpgcheck` for dnf/yum).

If you sign your Linux packages through your own pipeline and the target systems trust your keys, set `autoUpdater.allowUnverifiedLinuxPackages = false` to enforce verification — an unsigned or failing-GPG package will then fail to install rather than installing as root without verification.

`rpm --nodeps` is unaffected: it is a dependency-resolution bypass, not a signature bypass (rpm still verifies against the keyring).
