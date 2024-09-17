Installing macOS kernel extensions with `electron-builder` can be done using scripts.

First, in `package.json`, make sure you're building a package (`.pkg`) and not the default `.dmg`:

```json
"mac": { 
  "target": "pkg"
}
```

Place your script and the kernel extensions in `build/pkg-scripts`, or [define a custom directory](../configuration/pkg.md#PkgOptions-scripts). Note that the script **must** be called either `preinstall` or `postinstall`.  Remember to use ` #!/bin/sh` as the first line in your script. Also, your script must be executable (`chmod +x <filename>`).

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
