---
"app-builder-lib": patch
---

fix: suppress the macOS 26 "Installer would like to access data from other apps" prompt when building `pkg` installers. macOS 26's Installer probes the current-user-home install domain while parsing the deprecated `<domains>` element — even when that domain is disabled — which makes Installer.app request `kTCCServiceSystemPolicyAppData` as soon as the user leaves the Introduction pane. `rootVolumeOnly="true"` is now added to `<options>` when both `allowAnywhere` and `allowCurrentUserHome` are `false`; the install domains reported by `installer -volinfo` / `-dominfo` are unchanged, and `<domains>` is still emitted verbatim.
