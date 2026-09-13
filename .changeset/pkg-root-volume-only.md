---
"app-builder-lib": patch
---

fix(pkg): suppress the macOS 26 "Installer would like to access data from other apps" prompt by adding `rootVolumeOnly="true"` to `<options>` in the generated `distribution.xml` when both `allowAnywhere` and `allowCurrentUserHome` are `false`. macOS 26's Installer probes the current-user-home install domain while parsing the deprecated `<domains>` element — even when that domain is disabled — which trips `kTCCServiceSystemPolicyAppData` as soon as the user leaves the Introduction pane. The install domains reported by `installer -volinfo` / `-dominfo` are unchanged, and `<domains>` is still emitted verbatim (#10179)
