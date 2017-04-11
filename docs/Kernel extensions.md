# Kernel extensions

Installing macOS kernel extensions with `electron-builder` can be done using scripts.

First, make sure you're building a package:

```json
"mac": {
	{
		"target": "pkg",
		"arch": [ "x64" ]
	}
}
```

Place your script and the kernel extensions in `resources/pkg-scripts`, or [define a custom directory](https://github.com/electron-userland/electron-builder/wiki/Options#PkgOptions-scripts). Note that the script **must** be called either `preinstall` or `postinstall`.  Remember to use ` #!/bin/sh` as the first line in your script. Also, your script must be executable (`chmod +x <filename>`).

An example script:
```sh
#!/bin/sh

echo "Unloading and uninstalling old extensions..."
# unload old extensions
sudo kextunload /Library/Extensions/myExt.kext

# delete old extensions
sudo rm -rf /Library/Extensions/myExtension.kext

# install new extensions
echo "Installing and loading new extensions..."
sudo cp -R myExt.kext /Library/Extensions/myExt.kext
sudo kextload /Library/Extensions/myExt.kext/
```
