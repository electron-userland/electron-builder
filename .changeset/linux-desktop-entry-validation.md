---
"app-builder-lib": patch
---

fix(linux): validate `.desktop` entry keys and values before writing them, for every Linux target

The desktop entry of every Linux target that writes one is checked before it is written, so a configuration can no longer produce a corrupt `.desktop` file. The build fails with an `InvalidConfigurationError` naming the group and the key for a value with `\r` or `\n` inside it (from `linux.desktop.entry`, `desktopActions`, `linux.category`, `linux.mimeTypes`, `fileAssociations` or `protocols`), whose second line would become a new key or group of the file; a key that GLib, which most desktops read the file with, rejects (empty, or with `=`, a line break, or brackets other than a trailing locale such as `Name[de]`), which makes it ignore the whole file; and a `desktopActions` name with `[`, `]` or a control character. Write such a value on one line, with a newline in a string value as `\n`. Line breaks at the end of a value, as in a YAML block scalar, are dropped, and values are otherwise still written as given, so escapes such as `\;` keep working. Keys that the specification does not allow but desktop environments read, such as `X_Foo`, are kept.
