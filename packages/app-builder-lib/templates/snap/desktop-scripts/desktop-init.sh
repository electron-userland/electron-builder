#!/bin/bash -e

#################
# Launcher init #
#################

SNAP_DESKTOP_COMPONENTS_NEED_UPDATE="true"

# shellcheck source=/dev/null
. "$SNAP_USER_DATA/.last_revision" 2>/dev/null || true
if [ "$SNAP_DESKTOP_LAST_REVISION" = "$SNAP_REVISION" ]; then
  SNAP_DESKTOP_COMPONENTS_NEED_UPDATE="false"
else
  echo "SNAP_DESKTOP_LAST_REVISION=$SNAP_REVISION" > "$SNAP_USER_DATA/.last_revision"
fi

# Set $REALHOME to the users real home directory
REALHOME="$(getent passwd $UID | cut -d ':' -f 6)"

# If the user has modified their user-dirs settings, force an update
if [[ -f "$XDG_CONFIG_HOME/user-dirs.dirs.md5sum" && -f "$XDG_CONFIG_HOME/user-dirs.locale.md5sum" ]]; then
  if [[ "$(md5sum < "$REALHOME/.config/user-dirs.dirs")" != "$(cat "$XDG_CONFIG_HOME/user-dirs.dirs.md5sum")" ||
        "$(md5sum < "$REALHOME/.config/user-dirs.locale")" != "$(cat "$XDG_CONFIG_HOME/user-dirs.locale.md5sum")" ]]; then
    SNAP_DESKTOP_COMPONENTS_NEED_UPDATE="true"
  fi
fi

if [ "$SNAP_ARCH" == "amd64" ]; then
  ARCH="x86_64-linux-gnu"
elif [ "$SNAP_ARCH" == "armhf" ]; then
  ARCH="arm-linux-gnueabihf"
elif [ "$SNAP_ARCH" == "arm64" ]; then
  ARCH="aarch64-linux-gnu"
elif [ "$SNAP_ARCH" == "ppc64el" ]; then
  ARCH="powerpc64le-linux-gnu"
else
  ARCH="$SNAP_ARCH-linux-gnu"
fi

SNAP_DESKTOP_ARCH_TRIPLET="$ARCH"

if [ -f "$SNAP/lib/bindtextdomain.so" ]; then
  export LD_PRELOAD="$LD_PRELOAD:$SNAP/lib/bindtextdomain.so"
fi

export REALHOME
export SNAP_DESKTOP_COMPONENTS_NEED_UPDATE
export SNAP_DESKTOP_ARCH_TRIPLET

exec "$@"