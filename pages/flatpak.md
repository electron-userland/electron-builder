!!! warning "Single-file Flatpak bundles"
    Currently `electron-builder` does **not** support publishing apps to Flatpak repositories like [Flathub](https://flathub.org/). This means the Flatpak support in `electron-builder` is limited to generating [single-file bundles](https://docs.flatpak.org/en/latest/single-file-bundles.html) which have various limitations compared to app bundles installed from a repository.

    For what it's worth, there are [some](https://discourse.flathub.org/t/seeking-contractors-for-work-on-flathub-project/1889) [plans](https://discourse.flathub.org/t/is-it-possible-to-publish-a-self-contained-flatpak-file-to-flathub/2083) to make it easier to publish Electron apps to Flathub. When that happens, it should be easier to create a Flathub publisher for `electron-builder` (which would work similary to the other publishers).

The top-level [flatpak](configuration.md#flatpak) key contains a set of options instructing electron-builder on how it should build a [Flatpak](https://flatpak.org/) bundle.

!!! info "Build dependencies"
    The `flatpak` and `flatpak-builder` packages need to be installed in order to build Flatpak bundles.

## Troubleshooting

If the Flatpak build process fails with an error message like "flatpak failed with status code X", setting the `DEBUG="@malept/flatpak-bundler"` environment variable should provide more context about the error.

!!! example "Enable Flatpak build debug logging"
    `env DEBUG="@malept/flatpak-bundler" electron-builder build --linux flatpak`

## Configuration

{!./app-builder-lib.Interface.FlatpakOptions.md!}
