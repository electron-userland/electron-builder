---
"app-builder-lib": major
---

fix(linux): reject `.desktop` keys and values that would corrupt the file, for every Linux target

The desktop entry of every Linux target that writes one is checked before it is written. Line breaks at the end of a value, as in a YAML block scalar, are dropped, and values are otherwise still written as given, so escapes such as `\;` keep working. Keys that the specification does not allow but desktop environments read, such as `X_Foo`, are kept.

BREAKING CHANGE: a configuration that wrote a corrupt `.desktop` file now fails the build with an `InvalidConfigurationError` naming the group and the key: a value with `\r` or `\n` inside it (from `linux.desktop.entry`, `desktopActions`, `linux.category`, `linux.mimeTypes`, `fileAssociations` or `protocols`), whose second line became a new key or group of the file; a key that GLib, which most desktops read the file with, rejects (empty, or with `=`, a line break, or brackets other than a trailing locale such as `Name[de]`), which makes it ignore the whole file; and a `desktopActions` name with `[`, `]` or a control character. Write such a value on one line, with a newline in a string value as `\n`. The error says that the check is new in electron-builder v27 and links the migration guide.
