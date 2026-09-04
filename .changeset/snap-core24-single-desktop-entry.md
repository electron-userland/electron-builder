---
"app-builder-lib": patch
---

fix(snap): stop emitting a duplicate `.desktop` entry for core24 snaps. The core24 descriptor set both `apps.<app>.desktop` and the generated `snap/gui/<desktopName>.desktop` file, so the final snap carried two identical desktop entries and desktop environments showed two launcher items (#10077). The generated entry alone is kept — it preserves the `desktopName` filename that Wayland desktop environments match against the app_id (#10173) — matching the legacy core target, which never sets the `desktop` key.
