The top-level `deb` key contains set of options instructing electron-builder on how it should build Debian package.

<!-- do not edit. start of generated block -->
* <code id="DebOptions-compression">compression</code> = `xz` "gz" | "bzip2" | "xz" - The compression type.
* <code id="DebOptions-packageCategory">packageCategory</code> String - The [package category](https://www.debian.org/doc/debian-policy/ch-controlfields.html#s-f-Section).
* <code id="DebOptions-priority">priority</code> String - The [Priority](https://www.debian.org/doc/debian-policy/ch-controlfields.html#s-f-Priority) attribute.
* <code id="DebOptions-depends">depends</code> Array&lt;String&gt; - Package dependencies. Defaults to `["gconf2", "gconf-service", "libnotify4", "libappindicator1", "libxtst6", "libnss3"]`.

Inherited from [LinuxTargetSpecificOptions](/configuration/linux-other.md):
* <code id="DebOptions-icon">icon</code> String
* <code id="DebOptions-vendor">vendor</code> String
* <code id="DebOptions-maintainer">maintainer</code> String
* <code id="DebOptions-afterInstall">afterInstall</code> String
* <code id="DebOptions-afterRemove">afterRemove</code> String
<!-- end of generated block -->