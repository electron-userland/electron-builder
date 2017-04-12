# Inspect output if test uses temporary directory
Set environment variable `TEST_APP_TMP_DIR` (e.g. `/tmp/electron-builder-test`).
Specified directory will be used instead of random temporary directory and *cleared* on each run.

# Test Code Signing Ceritificates
If test installer certificate is expired: http://security.stackexchange.com/questions/17909/how-to-create-an-apple-installer-package-signing-certificate