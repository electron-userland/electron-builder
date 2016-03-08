# Running Windows tests on OS X

```
brew install Caskroom/cask/xquartz wine mono
```

# Running Linux tests on OS X
Do not use OS X bundled Ruby. Install using `brew`.

```
brew install ruby gnu-tar dpkg libicns
gem install fpm
```

# Inspect output if test uses temporary directory
Set environment variable `TEST_APP_TMP_DIR` (e.g. `/tmp/electron-builder-test`).
Specified directory will be used instead of random temporary directory and *cleared* on each run.