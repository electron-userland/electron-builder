---
title: "Building Flatpak Bundles in CI and Containers"
---

CI jobs often run in a container that is not privileged. A [Flatpak](../flatpak.md) build that works on a desktop machine fails there, because four things it relies on are missing:

| Missing in the container | What happens | What to do |
|---|---|---|
| FUSE | `flatpak-builder` fails: `Failure spawning rofiles-fuse` | [Set `additionalArgs.flatpakBuilder`](#configure-electron-builder) |
| User namespaces for bubblewrap | `flatpak build-export` fails: `is not a valid icon: bwrap: ...` | [Set `additionalArgs.buildExport`](#configure-electron-builder) |
| The runtime, the SDK and the base app | Every job downloads and installs them again (about 3.2 GB on disk for the default version, `26.08`) | [Install them in the image](#prepare-the-image) |
| A system D-Bus, when the build is not root | The base app cannot be installed or updated: `Could not connect: No such file or directory` | [Run the build inside `dbus-run-session`](#run-the-build), or build with the installed refs |

:::note
The `additionalArgs` option used here was added in electron-builder 27. Earlier versions cannot pass arguments to `flatpak-builder` or `flatpak build-export`.
:::

## Configure electron-builder

```yaml
flatpak:
  runtimeVersion: "26.08"
  baseVersion: "26.08"
  additionalArgs:
    flatpakBuilder:
      - "--disable-rofiles-fuse"
    buildExport:
      - "--disable-sandbox"
```

- `--disable-rofiles-fuse` makes `flatpak-builder` work without the FUSE mount it normally puts over the build directory.
- `--disable-sandbox` makes `flatpak build-export` validate the app's icons without a bubblewrap sandbox. The icons are still validated. [Building in unprivileged containers](../flatpak.md#building-in-unprivileged-containers) shows the error that each of the two arguments answers.
- `runtimeVersion` and `baseVersion` have to be the versions that are installed in the image. `26.08` is also the default; it is named here so that the configuration keeps matching the image when an electron-builder upgrade changes the default — see [Choosing Versions](../flatpak.md#choosing-versions).

electron-builder never adds the two arguments on its own. They do not change the contents of the bundle, and a build with them also works where FUSE and user namespaces are available, so one configuration can serve CI and local builds.

## Prepare the Image

The image needs three things:

- **`flatpak` 1.12.4 or newer and `flatpak-builder` 1.2.2 or newer.** The stock packages of Debian 12, Ubuntu 22.04 and newer releases are new enough. This image uses Debian 13, whose `flatpak-builder` 1.4.4 also handles AppStream metadata and meson and cmake modules with the current SDKs — see [Build Requirements](../flatpak.md#build-requirements). The `electronuserland/builder` images with a date tag newer than `-05.26` include both tools, and one of them can be used in place of this image — see [Use an electronuserland/builder Image](#electronuserland-builder-image).
- **A user for the build, with Flathub as a remote of its user installation.** electron-builder installs with `flatpak install --user`, which only searches user-level remotes.
- **The runtime, the SDK and the base app, installed for that user** in the versions from your configuration.

```dockerfile
ARG FLATPAK_BRANCH=26.08

FROM node:22-bookworm-slim AS node

FROM debian:trixie
ARG FLATPAK_BRANCH
ENV DEBIAN_FRONTEND=noninteractive

# Debian 13 has Flatpak 1.16.6 and flatpak-builder 1.4.4
RUN apt-get update \
 && apt-get install -y flatpak flatpak-builder fuse3 ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# Node.js and npm, copied out of the official image, which is Debian 12, whose flatpak-builder package is 1.2.3
COPY --from=node /usr/local/bin/node /usr/local/bin/node
COPY --from=node /usr/local/lib/node_modules /usr/local/lib/node_modules
RUN ln -s ../lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm \
 && ln -s ../lib/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx

# The build runs as this user, and the refs go into its user installation
RUN useradd --create-home --uid 1000 --shell /bin/bash builder
USER builder
WORKDIR /home/builder
ENV HOME=/home/builder

RUN flatpak remote-add --user --if-not-exists flathub https://dl.flathub.org/repo/flathub.flatpakrepo

# Runtime and SDK
RUN flatpak install --user --no-deps --noninteractive flathub org.freedesktop.Platform//$FLATPAK_BRANCH org.freedesktop.Sdk//$FLATPAK_BRANCH

# Base app, with a session bus standing in for the system D-Bus
RUN dbus-run-session -- sh -c 'DBUS_SYSTEM_BUS_ADDRESS=$DBUS_SESSION_BUS_ADDRESS flatpak install --user --no-deps --noninteractive flathub org.electronjs.Electron2.BaseApp//$FLATPAK_BRANCH'
```

```bash
docker build -t myapp-flatpak-builder .
```

If your configuration names another version than `26.08`, pass it to the build, for example `docker build --build-arg FLATPAK_BRANCH=25.08 -t myapp-flatpak-builder .`, so that the image holds the refs the build asks for.

Add what your project needs on top, for example the compiler toolchain for native modules.

Why the base app has a step of its own: it is an application, and when `flatpak` installs or updates an application it looks up parental controls on the system D-Bus. A container has no system bus, so the plain command fails for a non-root user:

```
Error: Failed to install org.electronjs.Electron2.BaseApp: Could not connect: No such file or directory
```

`dbus-run-session` starts a temporary session bus, and `DBUS_SYSTEM_BUS_ADDRESS=$DBUS_SESSION_BUS_ADDRESS` makes `flatpak` use it in place of the system bus. The runtime and the SDK are not applications and install without it. `dbus-run-session` belongs to the `dbus-daemon` package, which `apt-get install flatpak flatpak-builder` brings in on Debian 13 and Ubuntu 24.04.

The `flatpak install` steps can print `bwrap: No permissions to create a new namespace ...`, because the steps of `docker build` are not privileged either, and a warning that an optional extension, such as `org.freedesktop.Platform.openh264`, failed to install. Neither stops the installation: check the exit status of the step, not its output.

`flatpak` installs related refs along with the ones that are named. For `26.08` the user installation takes about 3.2 GB: the runtime, the SDK, their locale data, two branches of the GL extension, a codecs extension and the base app.

## Run the Build

Mount the project and run electron-builder inside the same `dbus-run-session` wrapper:

```bash
docker run --rm -v "$PWD":/project -w /project myapp-flatpak-builder \
  dbus-run-session -- sh -c 'DBUS_SYSTEM_BUS_ADDRESS=$DBUS_SESSION_BUS_ADDRESS npx electron-builder --linux flatpak --publish never'
```

The project's dependencies, electron-builder among them, have to be installed before this command runs. The bundle is written to `dist/`, for example `dist/myapp-1.0.0-x86_64.flatpak`. The user of the image (`builder`, uid 1000) needs write access to the project directory. `dbus-run-session` may print lines like `ignoring unknown child process 61`; they can be ignored.

The wrapper is needed because electron-builder brings the runtime, the SDK and the base app up to date at the start of every build. As long as the installed base app is the newest one, there is nothing to update and the plain command works too. Once Flathub publishes a newer build of the base app, the plain command starts to fail:

```
Error: Failed to update org.electronjs.Electron2.BaseApp: Could not connect: No such file or directory
```

There are three ways to deal with that:

- **Run electron-builder inside the wrapper**, as above. The update then succeeds.
- **Build with the refs of the image**: set `flatpak.installOrUpdateRefs` to `[]`, and electron-builder neither installs nor updates them, so the plain command works. The bundle then gets the versions that were installed when the image was built, until the image is rebuilt. See [Building With Installed Refs](../flatpak.md#building-with-installed-refs).
- **Rebuild the image**, which installs the newest base app again. This works until the next one is published.

Root is exempt from that lookup, so `flatpak` installs and updates the base app for root without the wrapper. A build without network access is not affected either: the update then finds nothing to do.

In a CI service, use the image as the image of the job and the wrapped command as its script.

## Use an electronuserland/builder Image {#electronuserland-builder-image}

The `electronuserland/builder` images with a date tag newer than `-05.26` include `flatpak` and `flatpak-builder`; those up to `-05.26` include neither — see [Flatpak in the Docker Images](../features/multi-platform-build.md#flatpak-in-the-docker-images). One of them can take the place of the image above. The [configuration](#configure-electron-builder) stays the same: the two additional arguments are needed in any container that is not privileged. Three things differ:

- **The runtime, the SDK and the base app are not in the image.** The first build downloads and installs them; [Flatpak in the Docker Images](../features/multi-platform-build.md#flatpak-in-the-docker-images) has the sizes. They go into the user installation of root, `/root/.local/share/flatpak`. With a named volume mounted there, later builds only bring them up to date. Without one, every container downloads them again, which the image above avoids.
- **The build runs as root**, and root needs no `dbus-run-session` wrapper.
- **Flathub is a remote for root only, with `HOME=/root`.** Where the container runs as another user or with another `HOME`, the build fails with `No remote refs found` unless the remote is added first, with the `flatpak remote-add` line of the Dockerfile above. A GitHub Actions job that runs in a `container`, for example, has `HOME` set to `/github/home`. The refs then go into `.local/share/flatpak` under that `HOME`, and a build that does not run as root needs the `dbus-run-session` wrapper of [Run the Build](#run-the-build) again.

```bash
docker run --rm -v "$PWD":/project -v electron-builder-flatpak:/root/.local/share/flatpak \
  electronuserland/builder:22 \
  npx electron-builder --linux flatpak --publish never
```

As above, the project's dependencies have to be installed before this command runs. `/project` is the working directory of the images.

## Run a Privileged Container in GitHub Actions {#github-actions}

On a GitHub-hosted runner, the `electronuserland/builder` image can run as a privileged container. electron-builder's own flatpak tests run this way, in the `test-flatpak` job of its [test workflow](https://github.com/electron-userland/electron-builder/blob/master/.github/workflows/test.yaml), with the image `electronuserland/builder:22-wine-chrome` (the `-wine-chrome` variant has Xvfb, which the tests need to start the app). The runtime, the SDK and the base app go into the user installation of the runner's user, `~/.local/share/flatpak`, and that directory is mounted into the container:

```yaml
- name: Allow unprivileged user namespaces
  run: sudo sysctl -w kernel.apparmor_restrict_unprivileged_userns=0

- name: Install the refs
  run: |
    test/src/linux/flatpak-docker.sh sh -c '
      flatpak remote-add --user --if-not-exists flathub https://dl.flathub.org/repo/flathub.flatpakrepo &&
      flatpak install --user -y --noninteractive flathub org.freedesktop.Platform//26.08 org.freedesktop.Sdk//26.08 org.electronjs.Electron2.BaseApp//26.08'
```

[`test/src/linux/flatpak-docker.sh`](https://github.com/electron-userland/electron-builder/blob/master/test/src/linux/flatpak-docker.sh) runs its arguments in the container, and the job's next step runs the tests the same way. What it does, and why:

- **`docker run --privileged`** gives the container `/dev/fuse` and lifts the seccomp and AppArmor profiles of Docker, which keep bubblewrap from creating namespaces. FUSE and user namespaces then work, so the configuration needs neither of the [two additional arguments](#configure-electron-builder).
- **It mounts `~/.local/share/flatpak` of the runner** at `.local/share/flatpak` under the `HOME` of the container user, so the refs that one step installs are there for the next, and the workspace at `/project`.
- **It runs the command as the runner's user, not as root.** That user owns the mounted directory, and as root `flatpak` refuses to install into a user installation that another user owns: `error: Refusing to operate on a user installation as root! This can lead to incorrect file ownership and permission errors.` Running as that user also leaves nothing owned by root on the runner. The script creates the user in the container with the uid and gid of the runner's user.
- **The command runs inside `dbus-run-session`**, with `DBUS_SYSTEM_BUS_ADDRESS` set to the session bus, the wrapper of [Run the Build](#run-the-build) for a build that does not run as root.
- **The `sysctl` step** lifts Ubuntu 24.04's AppArmor restriction of unprivileged user namespaces. It is a setting of the runner's kernel, and it also applies to bubblewrap when it runs as a user in the container.
- **The `flatpak remote-add` line** is needed because the image adds the Flathub remote for root only.

The refs are downloaded from Flathub on every run; in electron-builder's job, the runtimes, SDKs and base apps of two versions take about a minute and a half. To keep them between runs instead, restore `~/.local/share/flatpak` with [`actions/cache`](https://github.com/actions/cache) before the install step, and add `flatpak update --user -y --noninteractive` with the same refs after the `flatpak install` line, which skips refs that are installed:

```yaml
- name: Cache flatpak refs
  uses: actions/cache@v5
  with:
    path: ~/.local/share/flatpak
    key: flatpak-26.08-v1
```

The trade-off is the size of the entry: a user installation with the runtime and the SDK of one version is several GB, a large share of a repository's 10 GB cache. Once a repository goes over that limit, GitHub evicts the least recently used entries, and an entry this large may be gone before the next run can restore it. Keep the key fixed rather than unique per run, so that the job does not save a new entry every time.

## What Does Not Work

- **[`modules`](../flatpak.md#extra-modules).** `flatpak-builder` always runs a module's build commands under bubblewrap, and no argument turns that off. The build fails with the `bwrap:` error followed by `Error: module <name>: Child process exited with code 1`.
- **Running the app.** `flatpak run` needs bubblewrap as well and fails with `error: ldconfig failed, exit status 256`. Installing the bundle with `flatpak install --user` is possible, but only inside the `dbus-run-session` wrapper: the bundle is an application, like the base app.

## When the Build Fails

A failed `flatpak` or `flatpak-builder` command prints that tool's output as part of the build error. The table at the top of this page lists the errors that come from the container. Three more are not specific to containers and are explained under [Flatpak → Troubleshooting](../flatpak.md#troubleshooting):

- **`No remote refs found`:** a ref is not installed and no user-level remote has it, or the configured version does not exist. Make `runtimeVersion` and `baseVersion` match what is installed in the image.
- **`flatpak-builder 1.0.12 is not supported - version 1.2.2 or newer is required to build the flatpak target`:** the tools in the image are older than those of Ubuntu 22.04 and Debian 12.
- **`min-free-space-percent '3%' would be exceeded`:** the file system that holds the temporary directory is nearly full.

For `Failure spawning rofiles-fuse`, `is not a valid icon: bwrap: ...`, `No remote refs found`, `Command 'electron-wrapper' not found` and `execvp appstream-compose`, electron-builder also logs a hint that names the fix. To see every command it runs, set `DEBUG=electron-builder`.

## Outside a Container

On a machine where FUSE and user namespaces work, none of this is needed: install the tools, add the remote, and electron-builder does the rest — see [Build Requirements](../flatpak.md#build-requirements).
