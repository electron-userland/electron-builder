---
"app-builder-lib": patch
---

Use `update-alternatives` when available.

## What is changing?
Test for `update-alternatives` in DEB based installations and use this whenever possible.
In this way, middleware and downstream projects and users can specify binaries of their
own priority that would override this programs' configured executable.

## Why is this changing?
Personally, I don't want apps running as myself or a privileged user in my system.
For this. I have a shell that is executed to drop permissions first, then execute the
selected software.
Electron apps don't conform to this since they link directly rather than using a linking
system.

This change is to ensure that system is used before resorting to direct links.

## How should this be consumed?
If you are having issues on install or get errors about `/usr/bin/${executable}` already
exists, then simply remove the link and `update-alternatives` will take over from there.

If you are having isuses afterwards or still having issues, you can use the `--force`
argument to ensure links are created accordingly as such:

    update-alternatives --force --install /usr/bin/${executable} ${executable} /opt/${sanitizedProductName}/${executable} 100

This should clear up any linking issues. Going forward, if you want to override the
default, simply use a priority greater than 100.
