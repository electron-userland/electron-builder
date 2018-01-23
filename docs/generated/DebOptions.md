* <code id="DebOptions-compression">compression</code> = `xz` "gz" | "bzip2" | "xz" - The compression type.
* <code id="DebOptions-depends">depends</code> Array&lt;String&gt; - Package dependencies. Defaults to `["gconf2", "gconf-service", "libnotify4", "libappindicator1", "libxtst6", "libnss3"]`.
* <code id="DebOptions-packageCategory">packageCategory</code> String - The [package category](https://www.debian.org/doc/debian-policy/ch-controlfields.html#s-f-Section).
* <code id="DebOptions-priority">priority</code> String - The [Priority](https://www.debian.org/doc/debian-policy/ch-controlfields.html#s-f-Priority) attribute.
* <code id="DebOptions-fpm">fpm</code> Array - Advanced [fpm options](https://github.com/jordansissel/fpm/wiki#usage). Example: `["--before-install=build/deb-preinstall.sh", "--after-upgrade=build/deb-postinstall.sh"]`
