---
"app-builder-lib": patch
"builder-util": patch
---

fix(linux): `appstreamcli` is started by absolute path like every other host program, never by a name looked up on `PATH` (where package managers prepend directories such as `node_modules/.bin`). New `toolsets.executables` key: `appstreamcli`, with the default locations `/usr/bin/appstreamcli` and `/usr/local/bin/appstreamcli` on Linux and the Homebrew locations on macOS. The tool stays optional for `linux.metainfo` validation — when it is not installed at those locations the external `appstreamcli validate --no-net` run is skipped — and the flatpak target's up-front check still fails the build with instructions when a staged metainfo file needs it.
