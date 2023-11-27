!!! warning "Single-file Flatpak bundles"
    Currently `electron-builder` does **not** support publishing apps to Flatpak repositories like [Flathub](https://flathub.org/). This means the Flatpak support in `electron-builder` is limited to generating [single-file bundles](https://docs.flatpak.org/en/latest/single-file-bundles.html) which have various limitations compared to app bundles installed from a repository.

    For what it's worth, there are [some](https://discourse.flathub.org/t/seeking-contractors-for-work-on-flathub-project/1889) [plans](https://discourse.flathub.org/t/is-it-possible-to-publish-a-self-contained-flatpak-file-to-flathub/2083) to make it easier to publish Electron apps to Flathub. When that happens, it should be easier to create a Flathub publisher for `electron-builder` (which would work similary to the other publishers).

The top-level [flatpak](configuration.md#Configuration-flatpak) key contains a set of options instructing electron-builder on how it should build a [Flatpak](https://flatpak.org/) bundle.

!!! info "Build dependencies"
    The `flatpak` and `flatpak-builder` packages need to be installed in order to build Flatpak bundles.

<!-- do not edit. start of generated block -->
* <code id="FlatpakOptions-license">license</code> String | "undefined" - The path to EULA license file. Defaults to `license.txt` or `eula.txt` (or uppercase variants). Only plain text is supported.
* <code id="FlatpakOptions-runtime">runtime</code> String - The name of the runtime that the application uses. Defaults to `org.freedesktop.Platform`.
    
    See [flatpak manifest documentation](https://docs.flatpak.org/en/latest/flatpak-builder-command-reference.html#flatpak-manifest).

* <code id="FlatpakOptions-runtimeVersion">runtimeVersion</code> String - The version of the runtime that the application uses. Defaults to `20.08`.
    
    See [flatpak manifest documentation](https://docs.flatpak.org/en/latest/flatpak-builder-command-reference.html#flatpak-manifest).

* <code id="FlatpakOptions-sdk">sdk</code> String - The name of the development runtime that the application builds with. Defaults to `org.freedesktop.Sdk`.
    
    See [flatpak manifest documentation](https://docs.flatpak.org/en/latest/flatpak-builder-command-reference.html#flatpak-manifest).

* <code id="FlatpakOptions-base">base</code> String - Start with the files from the specified application. This can be used to create applications that extend another application. Defaults to [org.electronjs.Electron2.BaseApp](https://github.com/flathub/org.electronjs.Electron2.BaseApp).
    
    See [flatpak manifest documentation](https://docs.flatpak.org/en/latest/flatpak-builder-command-reference.html#flatpak-manifest).

* <code id="FlatpakOptions-baseVersion">baseVersion</code> String - Use this specific version of the application specified in base. Defaults to `20.08`.
    
    See [flatpak manifest documentation](https://docs.flatpak.org/en/latest/flatpak-builder-command-reference.html#flatpak-manifest).

* <code id="FlatpakOptions-branch">branch</code> String - The branch to use when exporting the application. Defaults to `master`.
    
    See [flatpak manifest documentation](https://docs.flatpak.org/en/latest/flatpak-builder-command-reference.html#flatpak-manifest).

* <code id="FlatpakOptions-finishArgs">finishArgs</code> Array&lt;String&gt; - An array of arguments passed to the flatpak build-finish command. Defaults to: ```json [   // Wayland/X11 Rendering   "--socket=wayland",   "--socket=x11",   "--share=ipc",   // Open GL   "--device=dri",   // Audio output   "--socket=pulseaudio",   // Read/write home directory access   "--filesystem=home",   // Allow communication with network   "--share=network",   // System notifications with libnotify   "--talk-name=org.freedesktop.Notifications", ] ```
    
    See [flatpak manifest documentation](https://docs.flatpak.org/en/latest/flatpak-builder-command-reference.html#flatpak-manifest).

* <code id="FlatpakOptions-modules">modules</code> Array&lt;any&gt; - An array of objects specifying the modules to be built in order.
    
    See [flatpak manifest documentation](https://docs.flatpak.org/en/latest/flatpak-builder-command-reference.html#flatpak-manifest).

* <code id="FlatpakOptions-files">files</code> Array - Files to copy directly into the app. Should be a list of [source, dest] tuples. Source should be a relative/absolute path to a file/directory to copy into the flatpak, and dest should be the path inside the app install prefix (e.g. /share/applications/).
    
    See [@malept/flatpak-bundler documentation](https://github.com/malept/flatpak-bundler#build-options).

* <code id="FlatpakOptions-symlinks">symlinks</code> Array - Symlinks to create in the app files. Should be a list of [target, location] symlink tuples. Target can be either a relative or absolute path inside the app install prefix, and location should be a absolute path inside the prefix to create the symlink at.
    
    See [@malept/flatpak-bundler documentation](https://github.com/malept/flatpak-bundler#build-options).

* <code id="FlatpakOptions-useWaylandFlags">useWaylandFlags</code> Boolean - Whether to enable the Wayland specific flags (`--enable-features=UseOzonePlatform --ozone-platform=wayland`) in the wrapper script. These flags are only available starting with Electron version 12. Defaults to `false`.

Inherited from `CommonLinuxOptions`:

* <code id="FlatpakOptions-synopsis">synopsis</code> String | "undefined" - The [short description](https://www.debian.org/doc/debian-policy/ch-controlfields.html#s-f-Description).
* <code id="FlatpakOptions-description">description</code> String | "undefined" - As [description](/configuration/configuration#Metadata-description) from application package.json, but allows you to specify different for Linux.
* <code id="FlatpakOptions-category">category</code> String | "undefined" - The [application category](https://specifications.freedesktop.org/menu-spec/latest/apa.html#main-category-registry).
* <code id="FlatpakOptions-mimeTypes">mimeTypes</code> Array&lt;String&gt; | "undefined" - The mime types in addition to specified in the file associations. Use it if you don't want to register a new mime type, but reuse existing.
* <code id="FlatpakOptions-desktop">desktop</code> any | "undefined" - The [Desktop file](https://developer.gnome.org/documentation/guidelines/maintainer/integrating.html#desktop-files) entries (name to value).
* <code id="FlatpakOptions-executableArgs">executableArgs</code> Array&lt;String&gt; | "undefined" - The executable parameters. Pass to executableName

Inherited from `TargetSpecificOptions`:

* <code id="FlatpakOptions-artifactName">artifactName</code> String | "undefined" - The [artifact file name template](/configuration/configuration#artifact-file-name-template).
* <code id="FlatpakOptions-publish">publish</code> The [publish](/configuration/publish) options.

<!-- end of generated block -->

---

## Troubleshooting

If the Flatpak build process fails with an error message like "flatpak failed with status code X", setting the `DEBUG="@malept/flatpak-bundler"` environment variable should provide more context about the error.

!!! example "Enable Flatpak build debug logging"
    `env DEBUG="@malept/flatpak-bundler" electron-builder build --linux flatpak`
