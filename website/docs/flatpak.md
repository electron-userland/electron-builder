:::warning[Single-file Flatpak bundles]
Currently `electron-builder` does **not** support publishing apps to Flatpak repositories like [Flathub](https://flathub.org/). Flatpak support in `electron-builder` is limited to generating [single-file bundles](https://docs.flatpak.org/en/latest/single-file-bundles.html) which have limitations compared to apps installed from a repository.
:::

The top-level [flatpak](configuration.md) key contains a set of options instructing electron-builder on how it should build a [Flatpak](https://flatpak.org/) bundle.

## What is Flatpak?

Flatpak is a universal Linux packaging system that runs apps in a sandbox with controlled access to system resources. Unlike AppImage (no sandbox) and Snap (Ubuntu-primary), Flatpak is designed to be distro-agnostic and runs on any Linux distribution with `flatpak` installed.

Key characteristics:
- **Sandboxed** — apps run in an isolated environment with portal-based access to system resources
- **Cross-distro** — works on Ubuntu, Fedora, Arch, Debian, and more
- **Runtime-based** — apps are built against a specific runtime (freedesktop, GNOME, KDE)
- **Distributed via Flathub** (for repository-based distribution — note: currently not supported by electron-builder)

## Flatpak vs. AppImage vs. Snap

| Aspect | Flatpak | AppImage | Snap |
|---|---|---|---|
| Sandboxed | Yes (portals) | No | Yes (interfaces) |
| Distro support | Any (flatpak required) | Universal | Any (snapd required) |
| Store/repo | Flathub (not via eb) | N/A | Snap Store |
| Auto-update | Flathub (not via eb) | AppImageUpdate | Snap Store |
| electron-builder output | Single-file bundle | Single file | Package |

## Build Requirements

Install `flatpak` and `flatpak-builder` on your Linux build machine — see [Flatpak setup](https://flatpak.org/setup/). On Debian and Ubuntu:

```bash
sudo apt-get install -y flatpak flatpak-builder fuse3
```

`fuse3` provides `fusermount3`, which `flatpak-builder` needs unless it runs with `--disable-rofiles-fuse`; Ubuntu 22.04's `flatpak-builder` does not pull it in.

electron-builder requires **`flatpak` 1.12.4 or newer** and **`flatpak-builder` 1.2.2 or newer**. `flatpak-builder` 1.2.2 is the one of Ubuntu 22.04, the oldest current distribution release, and it needs `flatpak` 1.12.4 or newer for its fix of CVE-2022-21682. electron-builder checks both when the flatpak target starts, before it installs a runtime or runs `flatpak-builder`, and fails the build if a tool is missing or too old:

```
cannot run flatpak - flatpak and flatpak-builder must be installed to build the flatpak target
flatpak-builder 1.0.12 is not supported - version 1.2.2 or newer is required to build the flatpak target
```

The stock packages of Ubuntu 22.04, Debian 12, RHEL 8 and 9 and newer releases are new enough; older releases, such as Ubuntu 20.04 (now only covered by Ubuntu Pro) and Debian 11, ship older tools:

| Distribution | `flatpak` | `flatpak-builder` |
|---|---|---|
| Ubuntu 22.04 | 1.12.7 | 1.2.2 |
| Ubuntu 24.04 | 1.14.6 | 1.4.2 |
| Ubuntu 26.04 | 1.16.6 | 1.4.8 |
| Debian 12 | 1.14.10 | 1.2.3 |
| Debian 13 | 1.16.6 | 1.4.4 |
| RHEL, AlmaLinux, Rocky Linux 8 and 9 | 1.12.9 | 1.2.3 |
| Fedora 43 | 1.16.6 | 1.4.12 |

`flatpak-builder` 1.4 or newer is still worth having in two cases:

- **AppStream metadata.** When the app contains `share/metainfo/<id>.metainfo.xml` or `share/appdata/<id>.appdata.xml`, named after the [application ID](#application-id), for example from [`files`](#custom-files-and-symlinks), `flatpak-builder` composes it. Before 1.4 it does so with `appstream-compose`, which the freedesktop SDK no longer ships from `24.08` on, so the build fails with `bwrap: execvp appstream-compose: No such file or directory`. 1.4 and newer use `appstreamcli`.
- **[Extra modules](#extra-modules).** The freedesktop SDK `24.08` and newer recommend `flatpak-builder` 1.4.4 or newer for meson and cmake modules, and electron-builder warns once when `modules` are built with an older one (Ubuntu 24.04 has 1.4.2).

Newer tools are available for older distributions: [`ppa:flatpak/stable`](https://launchpad.net/~flatpak/+archive/ubuntu/stable) for Ubuntu 22.04, and `bookworm-backports` for Debian 12 (`sudo apt-get install -t bookworm-backports flatpak-builder`, which works with the stock `flatpak`).

The `electronuserland/builder` Docker images with a date tag newer than `-05.26` include both tools, from that PPA, but no runtime, SDK or base app — see [Flatpak in the Docker Images](features/multi-platform-build.md#flatpak-in-the-docker-images). Images up to `-05.26` include neither tool.

Two more things have to be in place:

- **Flathub as a remote of the user installation**, unless the runtime, the SDK and the base app are already installed. electron-builder installs whichever of them is missing from it — see [Runtime, SDK and Base App](#runtime-and-sdk).
- **FUSE and unprivileged user namespaces.** `flatpak-builder` and `flatpak build-export` use them by default. FUSE needs `fusermount3`, from the `fuse3` package, which a desktop installation has but a minimal system or container may not: without it, `flatpak-builder` fails with `Command 'electron-wrapper' not found`. Where FUSE or user namespaces are unavailable, typically in an unprivileged container, see [Building in unprivileged containers](#building-in-unprivileged-containers).

## Runtime, SDK and Base App {#runtime-and-sdk}

Flatpak apps run against a runtime that provides base libraries. To build a bundle, three things have to be installed on the build machine — all of them, including the SDK:

| | Options | Defaults |
|---|---|---|
| **Runtime** — the libraries the app runs against | `runtime`, `runtimeVersion` | `org.freedesktop.Platform`, `26.08` |
| **SDK** — the development counterpart of the runtime, always in the version of the runtime | `sdk` | `org.freedesktop.Sdk` |
| **Base app** — an app whose files yours starts from. The default one, [Electron2.BaseApp](https://github.com/flathub/org.electronjs.Electron2.BaseApp), provides the `zypak-wrapper` that the bundle uses to start Electron | `base`, `baseVersion` | `org.electronjs.Electron2.BaseApp`, `26.08` |

### Installation and Updates

You do not have to install them yourself. At the start of every flatpak build, electron-builder looks for each of the three in the user installation and in the system installation (unless [`installOrUpdateRefs`](#building-with-installed-refs) leaves it out):

- **Installed:** it is brought up to date with `flatpak update`. This contacts the remote on every build; without a network connection the update finds nothing to do and the build continues (checked with Flatpak 1.16.6).
- **Not installed anywhere:** it is installed into the user installation (`~/.local/share/flatpak`) with `flatpak install --user`. The first build therefore downloads the runtime and the SDK. Together with the extensions that `flatpak` installs along with them, the defaults (version `26.08`) take 3.2 GB on disk, measured on aarch64.

`flatpak install --user` only searches the remotes of the user installation. A remote that was added system-wide, without `--user`, is not used. Add Flathub to the user installation once per build machine:

```bash
flatpak remote-add --user --if-not-exists flathub https://dl.flathub.org/repo/flathub.flatpakrepo
```

When no user-level remote has what is needed, the build fails with `No remote refs found` and electron-builder logs this command as a hint. A version that does not exist gives the same error.

### Building With Installed Refs {#building-with-installed-refs}

`installOrUpdateRefs` says which of the three electron-builder installs and updates: `"all"`, the default, or a list of `"runtime"`, `"sdk"` and `"base"`. To build with what is installed and contact no remote, list none:

```yaml
flatpak:
  installOrUpdateRefs: []   # or, for example, ["runtime", "sdk"] to leave only the base app as installed
```

A ref that is left out is used as it is installed, for the user or system-wide, and is not updated. If it is not installed, the build fails before it downloads or builds anything, with an error that names the ref. Use this:

- in an image that has the refs installed, so that a build does not update them;
- where the build user cannot update the base app, such as a container without a system D-Bus (see [Building Flatpak Bundles in CI and Containers](tutorials/flatpak-in-ci-and-containers.md#run-the-build));
- for builds without network access.

The refs then stay at the versions that are installed, without the fixes and security updates that Flathub publishes, until you update them yourself (`flatpak update`) or rebuild the image.

### Choosing Versions

`runtimeVersion` and `baseVersion` both default to `26.08`. A build that sets neither uses that version of the runtime, the SDK and the base app.

Set the two options together: `baseVersion` is not derived from `runtimeVersion`, and left out it stays at `26.08`. Setting both, even to the default, pins the versions, so the build stays on them when an electron-builder upgrade changes the default — as v27 did, from `20.08` (see the [migration guide](migration/v27-build-changes.md#flatpak-tooling-requirements)):

```yaml
flatpak:
  runtimeVersion: "26.08"   # runtime and SDK
  baseVersion: "26.08"      # base app — not derived from runtimeVersion
```

Versions reach end-of-life: Flathub then reports that the version is no longer receiving fixes and security updates. To check a version:

```bash
flatpak remote-info --user flathub org.freedesktop.Platform//26.08
flatpak remote-info --user flathub org.electronjs.Electron2.BaseApp//26.08
```

A runtime version that is end-of-life has an `End-of-life:` line in the output of the first command. As of October 2026, `25.08` and `26.08` are the freedesktop versions without one, and the base app is published for both; `20.08`, the default before v27, has one. The second command also names the runtime the base app was built against (`Runtime: org.freedesktop.Platform/<arch>/26.08`), which is why the two versions are kept the same.

Other runtimes can be used as well:

| Runtime | SDK | Use Case |
|---|---|---|
| `org.freedesktop.Platform` | `org.freedesktop.Sdk` | Standard Electron apps (recommended) |
| `org.gnome.Platform` | `org.gnome.Sdk` | GNOME-integrated apps |
| `org.kde.Platform` | `org.kde.Sdk` | KDE-integrated apps |

The GNOME and KDE runtimes have version numbers of their own (for example `49` and `6.10`), which is then what `runtimeVersion` takes — see [available Flatpak runtimes](https://docs.flatpak.org/en/latest/available-runtimes.html). `baseVersion` remains a version of the base app, which is numbered like the freedesktop runtime.

Quote the versions in a YAML configuration. An unquoted `6.10` is read as the number `6.1`.

## Finish Args (Permissions)

`finishArgs` are the permissions of the sandboxed app: everything it may reach outside its sandbox. Each one is a grant, not a requirement. It widens what code running in the app can do, including code that should not run there, such as a compromised dependency or a script injected into a window, so grant what the app uses. Flatpak's [sandbox permissions guide](https://docs.flatpak.org/en/latest/sandbox-permissions.html) describes them all.

Without `finishArgs`, electron-builder uses this default list, and says so in the build log:

```yaml
flatpak:
  finishArgs:
    - "--socket=wayland"
    - "--socket=x11"
    - "--share=ipc"
    - "--device=dri"
    - "--socket=pulseaudio"
    - "--filesystem=xdg-download"
    - "--share=network"
```

With the Electron base app before `23.08` (`baseVersion`), the default list also has `--talk-name=org.freedesktop.Notifications`. Setting `finishArgs` replaces the whole list instead of adding to it, so name every permission the app needs. Since v27 the default list grants the Downloads folder instead of the whole home directory (`--filesystem=home`), and the notifications talk-name only to those older base apps — see the [migration guide](migration/v27-runtime-changes.md#flatpak-default-permissions).

### What the Permissions Grant

| Arg | Grants | In the default list |
|---|---|---|
| `--socket=wayland` | The Wayland display | Yes |
| `--socket=x11` | The X11 display | Yes |
| `--share=ipc` | The IPC namespace of the host, which X11 needs for shared memory | Yes |
| `--device=dri` | The GPU (DRM devices), for WebGL and video decoding | Yes |
| `--socket=pulseaudio` | Sound through PulseAudio: playback **and recording, microphone included**, as well as MIDI and the ALSA devices in `/dev/snd` | Yes |
| `--filesystem=xdg-download` | The Downloads folder, read/write | Yes |
| `--share=network` | Network access | Yes |
| `--talk-name=org.freedesktop.Notifications` | Direct access to the desktop's notification daemon. libnotify 0.8 and later, in the base app since `23.08`, send notifications through the notification portal instead, so it is only needed on desktops without a portal backend for notifications | Only for the Electron base app before `23.08` |
| `--talk-name=org.kde.StatusNotifierWatcher` | Tray icons | No |
| `--talk-name=com.canonical.AppMenu.Registrar` | The global menu bar of desktops that have one | No |
| `--filesystem=home` | The whole home directory, read/write, dotfiles included — see [Narrowing Permissions](#narrowing-permissions) | No (it was until v26) |

### Files Without Filesystem Permissions

The app always has its own directory, `~/.var/app/<id>`: inside the sandbox `XDG_CONFIG_HOME`, `XDG_DATA_HOME` and `XDG_CACHE_HOME` point into it, so `app.getPath("userData")` needs no permission. Files elsewhere reach the app through portals:

- **Files the user picks.** On Electron 14 and later, Electron's file dialogs (`dialog.showOpenDialog`, `dialog.showSaveDialog`) go through the file chooser portal, which gives the app access to each file the user chooses.
- **Files opened from the desktop.** The desktop entry runs `electron-wrapper %U`. When the user opens a file with the app, for example from the file manager, flatpak forwards it through the document portal if the app cannot see it otherwise. Files passed on a terminal command line (`flatpak run <id> <file>`) are not forwarded.

### Narrowing Permissions

`--filesystem=home` gives the app read/write access to the whole home directory, dotfiles included: shell startup files such as `~/.bashrc` and `~/.profile`, `~/.config/autostart` and `~/.config/systemd/user`, `~/.ssh` and `~/.gnupg`. Only other apps' data under `~/.var/app` and the flatpak installation are hidden. Code running in the app can then leave the sandbox with a single file write: an entry in `~/.config/autostart`, for example, is started by the desktop outside the sandbox at the next login. That is why it is no longer a default. Grant it only if the app has to open arbitrary paths on its own, and prefer narrower grants:

| Arg | Grants |
|---|---|
| `--filesystem=xdg-documents`, `xdg-download`, `xdg-desktop`, `xdg-pictures`, `xdg-music`, `xdg-videos` | One of the user's folders, without the dotfiles around it |
| `--filesystem=<grant>:ro` | Read-only access, for example `--filesystem=xdg-pictures:ro` |
| `--persist=.myapp` | Keeps a hard-coded `~/.myapp` between runs, stored in `~/.var/app/<id>/.myapp` |
| `--filesystem=~/.pki/nssdb:ro` | The user's NSS certificate database, with corporate CA and client certificates (without `:ro` if the app imports certificates) |

Users can narrow an installed app without a rebuild, for example take home access away from an app that was built with it:

```bash
flatpak override --user --nofilesystem=home com.mycompany.myapp
```

`flatpak override --user --reset com.mycompany.myapp` removes the user's overrides of the app again.

## Branch

```yaml
flatpak:
  branch: stable    # Default: master
```

The branch is the last part of the app's ref (`app/com.mycompany.myapp/x86_64/stable`). It is embedded in the Flatpak bundle and visible to users, for example in `flatpak list`.

## Extra Modules

`modules` adds [flatpak-builder modules](https://docs.flatpak.org/en/latest/manifests.html#modules) to the build, for software that neither the runtime nor the base app provides and that has to be built from source. The entries are passed to `flatpak-builder` as they are:

```yaml
flatpak:
  modules:
    - name: libfoo
      buildsystem: meson
      sources:
        - type: archive
          url: https://example.com/libfoo-1.2.3.tar.xz
          sha256: "<sha256 of the archive>"
```

- Modules are built in order and install into `/app`, before the app itself is copied there.
- `flatpak-builder` downloads the sources. When the manifest has modules it runs with the complete environment of the build, so variables that `git` needs to fetch a private source reach it; without modules it fetches nothing and gets the same filtered environment as the `flatpak` commands.
- A module's build commands always run in a bubblewrap sandbox, so `modules` cannot be built in an [unprivileged container](#building-in-unprivileged-containers).

A library that is already built can be added with [`files`](#custom-files-and-symlinks) instead.

## Custom Files and Symlinks

`files` copies additional files and directories into the bundle, and `symlinks` creates links in it:

```yaml
flatpak:
  files:
    - - build/extra-binary     # source: a path on the build machine
      - /bin/extra-binary      # destination: /app/bin/extra-binary in the sandbox
  symlinks:
    - - /bin/extra-binary      # target: /app/bin/extra-binary
      - /bin/extra-alias       # link: /app/bin/extra-alias
```

Destinations, targets and links are paths **relative to the app prefix**, which is `/app` inside the sandbox. Do not include `/app` yourself: a destination of `/app/bin/extra-binary` ends up at `/app/app/bin/extra-binary`. The leading slash is optional. A destination or link that climbs out of the app prefix with `..` fails the build before anything is installed, with `flatpak.files destination "<path>" is outside the app prefix` (or `flatpak.symlinks link`). One that leads out of it through a symlink already in the prefix, placed by the base app, a module or an earlier `files` pair, fails the build when it is about to be written, with `... resolves outside the app prefix (/app in the sandbox) through a symlink`; such a symlink itself is kept, as long as nothing is written through it.

`files` is a list of `[source, destination]` pairs:

- A relative source is resolved against the current working directory, which is the project directory unless you start electron-builder from somewhere else.
- The destination is the path of the copied item itself. For a file that is the full path including the file name (`/bin/extra-binary`, not `/bin`); missing parent directories are created.
- A directory is copied with everything in it and merged into a destination that already exists. Symlinks inside it are kept as they are.
- The pairs are copied in order, after the app, so a pair can overwrite a file of the app, of the base app or of an earlier pair.

`symlinks` is a list of `[target, link]` pairs, created after the files are copied: the link `/app/<link>` points at `/app/<target>`.

### What electron-builder Puts in the Bundle

| Path in the sandbox | Content |
|---|---|
| `/app/lib/<id>/` | The packaged app |
| `/app/bin/<executableName>` | Symlink to `/app/lib/<id>/<executableName>` |
| `/app/bin/electron-wrapper` | The command of the bundle: a POSIX shell script that sets `TMPDIR` and replaces itself (`exec`) with `zypak-wrapper`, which starts the app with your [`executableArgs`](#executable-args) |
| `/app/share/applications/<id>.desktop` | Desktop entry, with `Exec=electron-wrapper %U` |
| `/app/share/icons/hicolor/<size>/apps/<id>.png` | Icons; sizes above 512×512 are left out |
| `/app/share/mime/packages/<id>.xml` | The MIME types of the [`fileAssociations`](configuration.md) that set a `mimeType`, with their extensions, so that the desktop recognizes those files and offers the app for them. Written only when one of them sets it |
| `/app/share/doc/<id>/copyright` | The license file, if the project has one |

`<id>` is the [Flatpak application ID](#application-id): your `appId` with every `-` replaced by `_` and every character other than letters, digits, `.` and `_` removed. For example, `com.mycompany.my-app` becomes `com.mycompany.my_app`.

Give a file association a `mimeType` only for a type of your own, such as `application/x-myapp-project`. Each one is declared with the description `<productName> document` and a generic document icon, and the MIME data that flatpak exports comes before the system's, so for a standard type such as `text/markdown` the desktop can show that description for every such file on the machine. The deb and AppImage targets declare the types the same way. To have the app offered for a standard type, list the type in `linux.mimeTypes`, which only adds it to the desktop entry.

The bundle contains no `<executableName>-launcher` script: the [launcher entrypoint](migration/v27-runtime-changes.md#linux-launcher-entrypoint) introduced in v27 does not apply to the flatpak target, which keeps `electron-wrapper`.

## Application ID {#application-id}

The application ID is more than a name to flatpak:

- It names the app's data directory, `~/.var/app/<id>`, which holds the app's settings and `userData`.
- It identifies the installed app. A bundle with the same ID, whoever built it, installs over the app as an update and gets its data.
- A bundle with another ID is another app: it installs beside the old one and starts with an empty data directory. Choose the ID before the first release.

Set `appId` (or `linux.appId`) to a reverse-DNS identifier on a domain you own. Without one, the ID is `com.electron.<name>`, made from the `name` in `package.json`, which an unrelated app with the same name gets as well. electron-builder then warns once per build.

The flatpak form of the ID has `_` in place of `-`, and characters other than `A-Za-z0-9._` are removed. It must then follow [flatpak's rules](https://docs.flatpak.org/en/latest/conventions.html#application-ids): at least three elements separated by periods, none empty or starting with a digit, and at most 255 characters. electron-builder checks this before it installs anything and fails the build with an `InvalidConfigurationError` otherwise: `com.myapp` has two elements, and a package named `3d-viewer` without `appId` gives `com.electron.3d_viewer`, whose last element starts with a digit.

### Desktop Name {#desktop-name}

Set `desktopName` in `package.json` to the application ID followed by `.desktop`, in its flatpak form, with `_` for `-`:

```json
{
  "desktopName": "com.mycompany.my_app.desktop"
}
```

The bundle installs its desktop entry as `share/applications/<id>.desktop`, as flatpak requires. Electron derives the Wayland app ID and the X11 `WM_CLASS` of its windows from `desktopName`, and the entry's `StartupWMClass` is set from it too. When `desktopName` is not the ID, desktops cannot match the app's windows to the entry: under Wayland, for example, the window has no icon. electron-builder warns once per build when `desktopName` is set to anything else. Without `desktopName`, it gives the warning of all Linux targets — see [Window Association](linux.md#window-association-desktopname).

## Executable Arguments {#executable-args}

`electron-wrapper` starts the app with `executableArgs`. The flatpak target gets `linux.executableArgs` too: its options are merged into the `linux` options, and two lists are joined, so a `flatpak.executableArgs` list adds to `linux.executableArgs`, and an empty one changes nothing. Set `flatpak.executableArgs` to `null` to start the flatpak without any of `linux.executableArgs`.

Leave `--no-sandbox` out of the flatpak. Inside flatpak, Chromium's sandbox works through `zypak-wrapper`, which starts the processes that Chromium sandboxes, such as the renderers that run web content, in a flatpak sandbox of their own, without the app's permissions. `--no-sandbox` turns that off, and those processes then run with every permission of the app. electron-builder keeps the flag but warns once per build, naming where it comes from (`linux.executableArgs`, `flatpak.executableArgs` or both).

If it is in `linux.executableArgs` for the AppImage, set it for the AppImage alone instead:

```yaml
appImage:
  executableArgs: ["--no-sandbox"]
```

## Wayland Support

Electron 38 and later run as a native Wayland app in a Wayland session by themselves: `--ozone-platform` defaults to `auto`, which picks Wayland when `XDG_SESSION_TYPE` is `wayland`. Older versions use X11, through XWayland, unless they are told otherwise. With `useWaylandFlags`, the wrapper script tells them, in a Wayland session only:

```yaml
flatpak:
  useWaylandFlags: true
```

The flags depend on the Electron version. They come after your [`executableArgs`](#executable-args) and before the arguments of the launch.

| Electron | Flags added in a Wayland session |
|---|---|
| 38 and later | none: the build logs that the option has no effect |
| 16 to 37 | `--ozone-platform=wayland` |
| 12 to 15 | `--enable-features=UseOzonePlatform --ozone-platform=wayland` |

From Electron 16, Ozone is on by default, so `--enable-features=UseOzonePlatform` is left out. Chromium keeps the last value of a repeated switch, so a second `--enable-features` could replace one in your `executableArgs`, such as `--enable-features=WaylandWindowDecorations`. electron-builder v26 added both flags for every Electron version; a build with Electron 16 to 37 warns once about the change — see the [migration guide](migration/v27-runtime-changes.md#flatpak-wayland-flags).

## How the Bundle Is Built

After packaging the app, electron-builder runs these steps for each architecture, in a scratch directory inside the system temp directory:

1. `flatpak --version` and `flatpak-builder --version` — the [version check](#build-requirements).
2. For the runtime, the SDK and the base app: `flatpak info --show-commit` for the user and the system installation, then `flatpak update` or `flatpak install --user` — see [Installation and Updates](#installation-and-updates). The refs that [`installOrUpdateRefs`](#building-with-installed-refs) leaves out are checked first, and only with `flatpak info`.
3. `flatpak-builder --arch <arch> --build-only <dir> <manifest>` — creates the app directory from the base app and builds the [modules](#extra-modules), if there are any.
4. The app, the wrapper script, the desktop entry, the MIME types, the license, the icons and your [`files`](#custom-files-and-symlinks) are copied into the app directory, and the symlinks are created.
5. `flatpak-builder --arch <arch> --finish-only <dir> <manifest>` — finishes the app with the [`finishArgs`](#finish-args-permissions).
6. `flatpak build-export --arch <arch> <repo> <dir> [branch]` — exports the app into a repository in the scratch directory.
7. `flatpak build-bundle --arch <arch> <repo> <file> <id> [branch]` — writes the `.flatpak` file from that repository.

The scratch directory is removed when the build ends.

### Additional Arguments

`additionalArgs` adds arguments to these commands, with one list per tool. Each list is inserted as it is, after electron-builder's own options and before the paths. electron-builder never sets any of them on its own.

| Option | Passed to | Reach for it when |
|---|---|---|
| `additionalArgs.flatpakBuilder` | Both `flatpak-builder` runs (steps 3 and 5) | FUSE is unavailable: `--disable-rofiles-fuse` |
| `additionalArgs.buildExport` | `flatpak build-export` (step 6) | bubblewrap cannot create namespaces: `--disable-sandbox` |
| `additionalArgs.buildBundle` | `flatpak build-bundle` (step 7) | The bundle should name the repository of its runtime: `--runtime-repo=https://dl.flathub.org/repo/flathub.flatpakrepo` |

The first two are what a build in an [unprivileged container](#building-in-unprivileged-containers) needs. `--runtime-repo` records in the bundle the URL of a `.flatpakrepo` file for the repository that supplies the app's runtime; the bundle itself contains the app, not the runtime.

## Local Testing

Build and install the Flatpak locally:

```bash
electron-builder --linux flatpak
# This produces dist/myapp-1.0.0-x86_64.flatpak

# Install it (no root required)
flatpak install --user dist/myapp-1.0.0-x86_64.flatpak

# Run it
flatpak run com.mycompany.myapp

# Remove it again
flatpak uninstall --user com.mycompany.myapp
```

The default file name is `${productName}-${version}-${arch}.flatpak`, where `${productName}` falls back to the `name` of `package.json` and `${arch}` is Flatpak's name for the architecture: `x86_64` for x64 and `aarch64` for arm64. Set `artifactName` to change it. The name to run is the [Flatpak application ID](#application-id).

## Building in unprivileged containers

CI jobs often run in a container that is not privileged, where FUSE and unprivileged user namespaces are unavailable. `flatpak-builder` and `flatpak` rely on both by default, so a build that works on your machine fails there — with the first error below and, once that is fixed, with the second. For each of them electron-builder logs a hint that names the option to set.

**`Failure spawning rofiles-fuse`**

```
fuse: device not found, try 'modprobe fuse' first
Error: Failure spawning rofiles-fuse, exit_status: 1024
```

`flatpak-builder` mounts the build directory through `rofiles-fuse`, a FUSE filesystem it uses to optimize its build cache, and that mount is not possible without FUSE. Pass `--disable-rofiles-fuse` to `flatpak-builder` to do without it.

**`is not a valid icon: bwrap: ...`**

```
error: .../build/export/share/icons/hicolor/256x256/apps/com.mycompany.myapp.png is not a valid icon: bwrap: No permissions to create a new namespace, likely because the kernel does not allow non-privileged user namespaces.
```

The icon itself is fine. `flatpak build-export` validates every exported icon inside a [bubblewrap](https://github.com/containers/bubblewrap) (`bwrap`) sandbox, and in such a container bubblewrap cannot create the namespaces that sandbox needs. The text after `bwrap:` varies with how the container is restricted. Pass `--disable-sandbox` to `flatpak build-export` to run the validator without the sandbox.

Both arguments are set through the flatpak options:

```yaml
flatpak:
  additionalArgs:
    flatpakBuilder:
      - "--disable-rofiles-fuse"
    buildExport:
      - "--disable-sandbox"
```

- electron-builder never adds either argument on its own. They are only needed where FUSE or user namespaces are unavailable, and they do not change the contents of the bundle.
- `--disable-sandbox` does not skip icon validation: icons are still validated, just not inside a sandbox.
- [`modules`](#extra-modules) cannot be built in such a container at all. `flatpak-builder` always runs a module's build commands under bubblewrap, and no argument turns that off.

Such a container usually differs from a desktop in two more ways: the runtime, the SDK and the base app are not installed in it yet, and it has no system D-Bus, which stops a build that does not run as root from installing or updating the base app. [Building Flatpak Bundles in CI and Containers](tutorials/flatpak-in-ci-and-containers.md) shows how to prepare an image, or use an `electronuserland/builder` one, and how to run the build in it.

## Troubleshooting

When a `flatpak` or `flatpak-builder` command fails, that tool's own output is printed as part of the build error. To also log every command electron-builder runs, enable debug logging:

```bash
env DEBUG=electron-builder electron-builder build --linux flatpak
```

Debug logging also keeps the staging directory `dist/__flatpak-<arch>` (wrapper script, desktop entry, MIME types, license, icons), which is otherwise removed when the target finishes. `DEBUG="@malept/flatpak-bundler"`, which earlier versions used, no longer has any effect.

**`cannot run flatpak` or `... is not supported - version ... or newer is required`:** A tool is missing or too old — see [Build Requirements](#build-requirements).

**`No remote refs found`:** The runtime, the SDK or the base app is not installed, and no remote of the user installation offers it. Add Flathub with `--user` and check that the configured versions exist — see [Runtime, SDK and Base App](#runtime-and-sdk).

**`Failure spawning rofiles-fuse` or `is not a valid icon: bwrap: ...`:** FUSE or user namespaces are unavailable, which is typical of unprivileged containers — see [Building in unprivileged containers](#building-in-unprivileged-containers).

**`Command 'electron-wrapper' not found`:** `rofiles-fuse` started but could not mount the app directory, because `fusermount3` is missing. Install the `fuse3` package, or set `additionalArgs.flatpakBuilder` to `["--disable-rofiles-fuse"]`.

**`bwrap: execvp appstream-compose: No such file or directory`:** The app contains AppStream metadata, which `flatpak-builder` before 1.4 cannot compose with the freedesktop SDK `24.08` or newer — see [Build Requirements](#build-requirements).

**`Failed to install org.electronjs.Electron2.BaseApp: Could not connect: No such file or directory`:** The build runs as a non-root user where there is no system D-Bus, typically in a container. The same error with `Failed to update` appears there once a newer base app has been published — see [Building Flatpak Bundles in CI and Containers](tutorials/flatpak-in-ci-and-containers.md#run-the-build).

**`min-free-space-percent '3%' would be exceeded`:** `flatpak build-export` stops when the file system that holds the scratch directory has less than 3% free space. Free some space, or set `TMPDIR` to a directory on a file system that has more.

**Sandbox permission denied:** Check the `finishArgs` — the app is likely trying to access something not in its allowed permissions. Run `flatpak run --log-session-bus com.mycompany.myapp` to see D-Bus access denials.

**GPU rendering issues:** Ensure `--device=dri` is in `finishArgs` for WebGL support. It is part of the default list, but not of a list you set yourself unless you add it.

## Configuration

{!./app-builder-lib.Interface.FlatpakOptions.md!}
