---
"app-builder-lib": minor
---

feat: Add support for Archive target for linux distributables to include the .desktop file

Set `linux.desktop` (or a per-target `desktop`) to a `LinuxDesktopFile` object or `true` to emit a standalone `<executableName>.desktop` artifact alongside archive targets (zip, 7z, tar.*); `false`/`null`/omitted suppresses it. Package-format targets (AppImage, Snap, deb, rpm, Flatpak) continue to always bundle their `.desktop`.

Also hardens `.desktop` generation: all field values (including `desktop.entry` overrides, `desktopActions`, `MimeType`, and `Categories`) are now escaped per the freedesktop spec, so a value containing a newline can no longer inject extra key=value lines into the generated file.
