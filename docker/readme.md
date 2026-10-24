It is developer documentation. See [user documentation](https://www.electron.build/docs/features/multi-platform-build#docker).

The `electronuserland/builder` images are built from this directory and published to [Docker Hub](https://hub.docker.com/r/electronuserland/builder/tags). The directory is the private workspace package `docker`, versioned on its own (see [Versioning and deploy](#versioning-and-deploy)).

# Images

`<node>` is the major version of Node.js, e.g. `22`.

| Image | Built from | Adds |
| --- | --- | --- |
| `base` | `buildpack-deps:22.04-curl` (Ubuntu 22.04) | The tools of the Linux targets and of native modules (`build-essential`, `gcc-multilib`, `g++-multilib`, `python3`, `rpm`, `git`, `git-lfs`, `ssh`, `libsecret-1-dev`, …), Yarn 1, `libssl1.1`, and `flatpak` and `flatpak-builder` |
| `<node>` | `base` | Node.js and pnpm 10.18.0. pnpm 10 needs Node.js 18.12 or newer, so it does not run in `14` and `16`. |
| `<node>-wine` | `<node>` | Wine (`winehq-stable` from WineHQ) and PowerShell |
| `<node>-wine-mono` | `<node>-wine` | Mono, for the Squirrel.Windows target. The tests run in `22-wine-mono`. |
| `<node>-wine-chrome` | `<node>-wine` | Google Chrome and Xvfb, for headless tests |

* The table describes the Dockerfiles. The published images are those of the last deploy: the `-05.26` images, for example, have no `flatpak`.
* Only Node.js, pnpm, Ubuntu 22.04 and the key of the Flatpak PPA are pinned. Yarn, Wine, PowerShell, Chrome, flatpak and the Ubuntu packages are the versions current at build time, so two builds of one commit can differ.
* The images are `linux/amd64` only. Ubuntu 22.04 has no `gcc-multilib` and `g++-multilib` for arm64, so every `FROM` pins `--platform=linux/x86_64`.

## Tags

[build.sh](build.sh) tags every image twice: `<image>`, and `<image>-MM.YY`, dated by the month of the build (`date +%m.%y`, month first). For example, `22-wine-mono` and `22-wine-mono-10.26` in October 2026.

The deploy also tags the images of `LATEST_IMAGE_NODE_MAJOR_VERSION` of [deploy-docker.yml](../.github/workflows/deploy-docker.yml) (24): `24` as `latest`, `24-wine` as `wine`, `24-wine-mono` as `wine-mono` and `24-wine-chrome` as `wine-chrome`. The deploy gives these aliases no dated tag. The `wine-MM.YY`, `wine-mono-MM.YY` and `wine-chrome-MM.YY` tags on Docker Hub are left from deploys of 2021 and earlier.

* A second deploy in the same month overwrites the dated tags of the first, so only a digest pins one build.
* Every Node.js version of a deploy builds and pushes its own `base` and `base-MM.YY`, so the one pushed last wins. The published `base` is the parent of the images of that one Node.js version only.
* A deploy never deletes a tag. The tags of a Node.js version removed from the matrix stay on Docker Hub as they were.

## Node.js versions

The Node.js versions are the matrix of [docker-build.yml](../.github/workflows/docker-build.yml), as full versions. The matrix of deploy-docker.yml lists the same major versions.

* To update a version, e.g. 22.23.3 to 22.23.4, change it in docker-build.yml.
* To add or drop a version, change both matrices. A major version that only docker-build.yml lists is built and not pushed. One that only deploy-docker.yml lists has no images artifact, so the deploy fails.
* `LATEST_IMAGE_NODE_MAJOR_VERSION` of deploy-docker.yml is the version of `latest`, `wine`, `wine-mono` and `wine-chrome`. It has to be in the matrix of deploy-docker.yml, or the deploy does not update these tags.
* `TEST_IMAGE_NODE_MAJOR_VERSION` of [test.yaml](../.github/workflows/test.yaml) (22) is the version the tests run in. It has to be in the matrices too, and the default image of [run-tests.sh](run-tests.sh) (`22-wine-mono`) has to be changed with it.

Each of these changes needs a changeset for `docker` (see [Versioning and deploy](#versioning-and-deploy)), except a change of only `TEST_IMAGE_NODE_MAJOR_VERSION` and the default image of run-tests.sh, which changes no image.

# Build

From the repository root, with a full Node.js version of the matrix, without `v`:

```sh
pnpm docker-images 22.23.3
```

This runs [build.sh](build.sh), which builds the five images for that Node.js version, then lists all local `electronuserland/builder` images.

* The build contexts (`docker/base`, …) are relative to the current directory, so run `bash docker/build.sh 22.23.3` from the repository root. `pnpm docker-images` runs it there. In `docker/`, which is a workspace package of its own, use `pnpm -w docker-images 22.23.3`.
* Without a version, `base` is built, then the next image fails with `invalid reference format`.
* Docker 23.0 or newer (Buildx 0.10 or newer) is needed for `--provenance=false`. The comment in build.sh explains why the images are built without the provenance attestation.
* build.sh always builds the five images. To rebuild one, run its `docker build` command of build.sh with the tag of its parent in `IMAGE_VERSION`:

  ```sh
  docker build --provenance=false --build-arg IMAGE_VERSION=22-wine -t electronuserland/builder:22-wine-mono docker/wine-mono
  ```

  Without `IMAGE_VERSION`, a Dockerfile builds on a published moving tag: `base` for `node`, `latest` (Node.js 24, without Wine) for `wine`, and `wine` (Node.js 24) for `wine-mono` and `wine-chrome`.

# Test in Docker

```sh
pnpm test:linux
TEST_FILES=snapTest pnpm test:linux
```

[run-tests.sh](run-tests.sh) runs the tests in `electronuserland/builder:22-wine-mono`, the image of CI's Linux test shards.

* Without `TEST_FILES`, and with `CI` not set, the whole suite runs, which is slow. Set `VITEST_SHARD_COUNT` and `VITEST_SHARD_INDEX` (from 0) to run one shard of it.
* `CI` is passed as it is set on the host, so a local run is not a CI run, as on the host: vitest writes a missing snapshot instead of failing (a changed one still fails), and the smart reporter prints a line per test (`-e SMART_REPORTER_VERBOSE=false` in `ADDITIONAL_DOCKER_ARGS` turns that off).
* run-tests.sh mounts the current directory at `/project`, so run it from the repository root. `pnpm test:linux` does that. In the container, [test-in-docker.sh](test-in-docker.sh) installs corepack and bun, then runs `pnpm install --force`, `pnpm compile` and `pnpm ci:test`. pnpm is the version of `packageManager` in the root `package.json`, via corepack, not the pnpm 10.18.0 of the image. run-tests.sh also mounts the corepack home of the host (`$COREPACK_HOME`, else `~/.cache/node/corepack`, which `.github/actions/pnpm` caches on the runner) at `/root/.cache/node/corepack`, so corepack in the container finds that pnpm without a download. When it has to download it, test-in-docker.sh tries `corepack install` up to 3 times, and gives the corepack home back to the owner of `.git` when it ends.
* The image is pulled, with 3 attempts, only if it is not present locally. So a locally built image of that tag is used as is, and an outdated one is not updated: run `docker pull electronuserland/builder:22-wine-mono` to update it.
* To test a change of an image, build the images with `pnpm docker-images 22.23.3`, then run the tests. build.sh gives the local images the published tags, so run-tests.sh uses the local `22-wine-mono`.
* To work in an image, start a shell in it with `docker run --rm -it electronuserland/builder:22-wine-mono`. It starts `bash` in `/project`. To mount the repository as the tests do, add `-v "$PWD:/project" -v "$PWD/node-modules-docker:/project/node_modules"`.

| Variable | Default | |
| --- | --- | --- |
| `TEST_RUNNER_IMAGE_TAG` | `electronuserland/builder:22-wine-mono` | The image to run the tests in |
| `ELECTRON_CACHE_PATH` | `~/Library/Caches/electron` on macOS, `~/.cache/electron` otherwise | Mounted at `/root/.cache/electron` |
| `ELECTRON_BUILDER_CACHE_PATH` | `~/Library/Caches/electron-builder` on macOS, `~/.cache/electron-builder` otherwise | Mounted at `/root/.cache/electron-builder` |
| `ADDITIONAL_DOCKER_ARGS` | | More `docker run` options, split on whitespace, e.g. `-v /tmp/test-app:/tmp/test-app -e TEST_APP_TMP_DIR=/tmp/test-app` to keep the build output of a test on the host. Quotes in it are kept as is, so no value can contain a space. |

`CI`, `DEBUG`, `TEST_FILES`, `TEST_MODE` (`all`, `unit` or `e2e`), `UPDATE_SNAPSHOT`, `UPDATE_LOCKFILE_FIXTURES`, `VITEST_SHARD_INDEX` and `VITEST_SHARD_COUNT` are passed to the container, even when they are not set: `UPDATE_LOCKFILE_FIXTURES` as `false`, the others as empty. Only `UPDATE_SNAPSHOT=true` and `UPDATE_LOCKFILE_FIXTURES=true` update, any other value is ignored. Any other variable has to be passed in `ADDITIONAL_DOCKER_ARGS`, with `-e` or `--env-file`. An `-e` in it comes after the variables above and overrides them, but an `--env-file` does not, because `docker run` lets every `-e` override a value from an `--env-file`, whatever the order.

# CI

* [test.yaml](../.github/workflows/test.yaml) rebuilds all images with docker-build.yml when a PR, or a push to `master` or `release/v*`, changes `docker/*/Dockerfile`, `docker/build.sh` or docker-build.yml. It also rebuilds them when it is run manually with `rebuild-docker-images`.
* docker-build.yml saves the images of each Node.js version as an artifact (`electron-builder-all-<node>`, the output of `docker save`, kept for a day). Test Linux and Test Updater load `electron-builder-all-22`, and the deploy loads all of them. Without a rebuild, Test Linux and Test Updater pull the published `22-wine-mono`.
* So a PR that changes an image runs the tests in the rebuilt `22-wine-mono`, and with it in its `base`, `22` and `22-wine`. `wine-chrome` and the images of the other Node.js versions are only built. Until the change is deployed, other PRs run the tests in the published image, which does not have it.
* With a rebuild, Test Linux and Test Updater wait for the builds of all Node.js versions. If one of them fails, both jobs are skipped.
* Test Linux (all shards) and Test Updater run in `<node>-wine-mono`, where `<node>` is `TEST_IMAGE_NODE_MAJOR_VERSION` of test.yaml (22). The other Linux jobs (Test Snap, Test e2e Auto Updater Linux, Test Flatpak) do not use these images.
* A change to run-tests.sh or test-in-docker.sh needs no rebuild. They are not part of an image: run-tests.sh runs on the host, and test-in-docker.sh runs from the repository mounted at `/project`.

# Versioning and deploy

The workspace package `docker` ([package.json](package.json), private, never published to npm) is versioned with changesets on its own. It is not in the linked group of electron-builder's packages, and its changelog is `docker/CHANGELOG.md`. A changeset that names only `docker` is left out of the root `CHANGELOG.md` and of the GitHub release notes. A changeset that also names another package is listed there as if it named only the other packages, without `docker` (e.g. one for `docker` and `app-builder-lib` under `electron-builder@<version>`).

The images on Docker Hub have the tags of [Tags](#tags), not the package version. The version and `docker/CHANGELOG.md` record what changed in the images between two versions, and the git tag `docker@<version>` records the commit a version is deployed from. The Release workflow creates the tag when it starts the deploy, so a version whose deploy failed has its tag too. Up to and including `docker@26.11.1`, each `docker@` tag had the version of electron-builder at the tagged commit, and the package starts from 26.11.1.

1. A PR that changes an image adds a changeset for `docker` (`pnpm changeset`, then select `docker`). That includes a change of the Node.js versions in the workflows, which are outside `docker/`. Use major for a breaking change of the images, e.g. a removed tool or Node.js version, minor for a new tool or Node.js version, and patch for a fix or an update. To deploy again without a change, e.g. for newer Ubuntu packages, add a patch changeset.
2. The release PR of changesets bumps the version in `docker/package.json` and writes `docker/CHANGELOG.md`. It is the release PR of every package, so merging it also publishes the packages that have changesets to npm. While the repository is in pre mode (`.changeset/pre.json`), the version is a prerelease, e.g. `26.12.0-alpha.0`. A prerelease is deployed like any other version: it overwrites the moving tags, `latest` included.
3. The merged release PR deploys the new version. The Release workflow ([pr-release.yml](../.github/workflows/pr-release.yml)) runs on the push to `master`, publishes, and then finds the version of `docker/package.json` without its tag `docker@<version>`. Its step "Tag a new docker version" tags the commit (an annotated tag by the release bot, created through the GitHub REST API with `gh`), and its job `deploy-docker` runs deploy-docker.yml on that commit. A later run finds the tag on another commit and does not deploy it again. A deploy that is still waiting for the one before it is cancelled when a newer version is tagged, so only the newer one is deployed. changesets itself does not tag `docker`: it is private, `privatePackages.tag` is false by default, and the `changeset tag` of `pnpm ci:publish` only tags electron-builder and electron-updater (`patches/@changesets__cli@2.29.7.patch`).
4. deploy-docker.yml builds the images of every Node.js version with docker-build.yml, and does not run test.yaml: the release commit only reaches `master` after its PR passed CI. When the builds of all Node.js versions have passed, it pushes all tags of `electronuserland/builder` to Docker Hub. The deploy builds the images again, so they are only tested by a PR that changes `docker/*/Dockerfile`, `docker/build.sh` or docker-build.yml (see [CI](#ci)), and the packages that are not pinned can differ from the tested images. A deploy from a changeset alone, e.g. for newer Ubuntu packages, pushes images that no test has run. The `DOCKERHUB_USERNAME` and `DOCKERHUB_TOKEN` secrets are in the `release` environment, which only a run on `master`, `release/*` or `changeset-release/*` can use, and the Release workflow passes them to deploy-docker.yml by name. Only the Release workflow on `master` deploys: its tag step runs on `master` only, so a `release/v*` branch never deploys, although the environment allows it. No workflow runs on a tag, so pushing a `docker@` tag by hand deploys nothing, and on another commit than the release commit it even stops the deploy of that version. When deploy-docker.yml is run manually (`workflow_dispatch`, on `master`, `release/*` or `changeset-release/*`), it builds, and does not push.

If the deploy fails, re-run the failed jobs of the Release run in GitHub Actions. Each Node.js version is pushed by its own job, and a failed job does not cancel the others. Re-running only the failed jobs works until the image artifacts expire, a day after docker-build.yml uploaded them. After that, re-run all jobs of the Release run (GitHub allows it for 30 days), which builds the images again, with dated tags of the month of the re-run. A re-run uses the commit of its run, and its tag step finds the tag on that commit, so it deploys the version again, unless a later commit has a newer `docker@` tag. A re-run of an older Release run that failed before its tag step does not find its tag, and it does not tag or deploy its version either when a later commit has a newer `docker@` tag. Re-running only the failed deploy jobs of such an older run skips the tag step, so it still deploys and puts the older images back on the moving tags: don't. If the images need a fix, release it as a new version.

# Notes

* `node_modules` in the container is the directory `node-modules-docker` of the repository root (ignored by git), mounted over `/project/node_modules`. So the container never uses the host's root `node_modules`, which can be installed for another platform. test-in-docker.sh always deletes `node_modules/.modules.yaml` and runs `pnpm install --force`. `--force` installs the optional dependencies of every platform, not only those of linux-x64 (e.g. all `@rollup/rollup-*` and `@esbuild/*` packages), so `@rollup/rollup-linux-x64-gnu` is there even when `node-modules-docker` was installed for another platform. Delete `node-modules-docker` to install from scratch.

  The `node_modules` of the workspace packages (`packages/*/node_modules`, `test/node_modules`, …) are in the mounted repository, so the install in the container rewrites them on the host. Their links are relative, so they point to `node-modules-docker` in the container and to `node_modules` on the host.

* The container runs as root: run-tests.sh passes no `--user`, and the images set no `USER`. `npm i -g` in test-in-docker.sh needs it, and so does snapcraft in `test/src/linux/test-snap.sh`, which runs run-tests.sh in Canonical's snapcraft images with `--privileged`. When test-in-docker.sh ends, also after a failed step, it gives `test/src/generated`, `test-results`, `vitest-blobs` and `coverage` to the owner of `.git`. On a Linux host, everything else that the container writes is owned by root, e.g. `node-modules-docker`, the `node_modules` of the workspace packages and `packages/*/out` of `pnpm compile`, so deleting them can need `sudo`. Docker Desktop on macOS maps them to your user.

* On Apple Silicon and other arm64 hosts, the images build and run under emulation (QEMU, or Rosetta in Docker Desktop).
  * `wineboot --init` can fail under QEMU. The `wine` image accepts that failure when its error output contains `host_page_mask`, `anon_mmap` or `qemu`, and fails on any other.
  * Mono crashes under emulation, and `ca-certificates-mono` runs it at install (`cert-sync`). So the `wine-mono` image points `/usr/bin/mono` at `/bin/true` (`dpkg-divert`) while `mono-devel` is installed. It does so on every platform, so the hook runs `cert-sync` as a no-op, and Mono's certificate store (`/etc/mono/certstore`) is empty in every image.
  * Wine and Mono can also abort at run time, e.g. `wine cmd /c ver`, so the tests that run them can fail in `pnpm test:linux` on an arm64 host.

* `libssl1.1` is installed from Ubuntu 20.04's `focal-security` (pinned to that one package), because the Linux `osslsigncode` of the winCodeSign toolsets needs `libcrypto.so.1.1`, and Ubuntu 22.04 has `libssl3`. The source and the pin are removed after the install, so only a rebuild of the image updates `libssl1.1`.

* `flatpak` and `flatpak-builder` are installed in the `base` image, so every image has them. They come from the Flatpak team's PPA (`ppa:flatpak/stable`, signing key pinned by its fingerprint) and not from Ubuntu. Ubuntu 22.04's own packages (1.12.7 and 1.2.2) meet the flatpak target's minimum, but flatpak-builder 1.4 and newer also handle AppStream metadata with the current SDKs, and 1.4.4 and newer meson and cmake modules. The versions follow the PPA. `elfutils` and `zstd`, which flatpak-builder recommends, and `fuse3`, whose `fusermount3` flatpak-builder's `rofiles-fuse` needs, are installed with them from Ubuntu.

  No runtime, SDK or base app is installed — a build downloads what it needs from the `flathub` remote. The remote is added with `--user` for root, the user the images run as, because the flatpak target installs into the user installation. A container that runs as another user or with another `HOME` does not see it.

  See [user documentation](https://www.electron.build/docs/features/multi-platform-build#flatpak-in-the-docker-images).
