#!/bin/bash

# The purpose of this script is to provide lightweight desktop integration
# into the host system without special help from the host system.
# If you want to use it, then place this in usr/bin/$APPNAME.wrapper
# and set it as the Exec= line of the .desktop file in the AppImage.
#
# For example, to install the appropriate icons for Scribus,
# put them into the AppDir at the following locations:
#
# ./usr/share/icons/default/128x128/apps/scribus.png
# ./usr/share/icons/default/128x128/mimetypes/application-vnd.scribus.png
#
# Note that the filename application-vnd.scribus.png is derived from
# and must be match MimeType=application/vnd.scribus; in scribus.desktop
# (with "/" characters replaced by "-").
#
# Then, change Exec=scribus to Exec=scribus.wrapper and place the script
# below in usr/bin/scribus.wrapper and make it executable.
# When you run AppRun, then AppRun runs the wrapper script below
# which in turn will run the main application.
#
# TODO:
# Handle multiple versions of the same AppImage?
# Handle removed AppImages? Currently we are just setting TryExec=
# See http://specifications.freedesktop.org/thumbnail-spec/thumbnail-spec-latest.html#DELETE
# Possibly move this to the C runtime that is part of every AppImage?

# Exit on errors
set -e

THIS="$0"

HERE="$(dirname "$(readlink -f "${THIS}")")"
export PATH="${HERE}/usr/bin:${HERE}/usr/sbin:${PATH}"
export LD_LIBRARY_PATH="${HERE}/usr/lib:${LD_LIBRARY_PATH}"
export XDG_DATA_DIRS="${HERE}/usr/share:${XDG_DATA_DIRS}"
export GSETTINGS_SCHEMA_DIR="${HERE}/usr/share/glib-2.0/schemas:${GSETTINGS_SCHEMA_DIR}"

# Be verbose if $DEBUG=1 is set
if [ ! -z "$DEBUG" ] ; then
  env
  set -x
fi

args=("$@") # http://stackoverflow.com/questions/3190818/
NUMBER_OF_ARGS="$#"

# Please do not change $VENDORPREFIX as it will allow for desktop files
# belonging to AppImages to be recognized by future AppImageKit components
# such as desktop integration daemons
VENDORPREFIX=appimagekit

echo "$APPDIR"

BIN="${HERE}/usr/bin/app"

trap atexit EXIT

# Note that the following handles 0, 1 or more arguments (file paths)
# which can include blanks but uses a bashism; can the same be achieved
# in POSIX-shell? (FIXME)
# http://stackoverflow.com/questions/3190818
atexit()
{
if [ $NUMBER_OF_ARGS -eq 0 ] ; then
  exec "${BIN}"
else
  exec "${BIN}" "${args[@]}"
fi
}

error()
{
  if [ -x /usr/bin/zenity ] ; then
    LD_LIBRARY_PATH="" zenity --error --text "${1}" 2>/dev/null
  elif [ -x /usr/bin/kdialog ] ; then
    LD_LIBRARY_PATH="" kdialog --msgbox "${1}" 2>/dev/null
  elif [ -x /usr/bin/Xdialog ] ; then
    LD_LIBRARY_PATH="" Xdialog --msgbox "${1}" 2>/dev/null
  else
    echo "${1}"
  fi
  exit 1
}

yesno()
{
  TITLE=$1
  TEXT=$2
  if [ -x /usr/bin/zenity ] ; then
    LD_LIBRARY_PATH="" zenity --question --title="$TITLE" --text="$TEXT" || exit 0
  elif [ -x /usr/bin/kdialog ] ; then
    LD_LIBRARY_PATH="" kdialog --caption "Disk auswerfen?" --title "$TITLE" -yesno "$TEXT" || exit 0
  elif [ -x /usr/bin/Xdialog ] ; then
    LD_LIBRARY_PATH="" Xdialog --title "$TITLE" --clear --yesno "$TEXT" 10 80 || exit 0
  else
    echo "zenity, kdialog, Xdialog missing. Skipping ${THIS}."
    exit 0
  fi
}

check_prevent()
{
  FILE=$1
  if [ -e "$FILE" ] ; then
    exit 0
  fi
}

# Exit immediately of one of these files is present
# (e.g., because the desktop environment wants to handle desktop integration itself)
check_prevent "$HOME/.local/share/$VENDORPREFIX/no_desktopintegration"
check_prevent "/usr/share/$VENDORPREFIX/no_desktopintegration"
check_prevent "/etc/$VENDORPREFIX/no_desktopintegration"

# Exit immediately if appimaged is running
pidof appimaged 2>/dev/null && exit 0

# Exit immediately if $DESKTOPINTEGRATION is not empty
if [ ! -z "$DESKTOPINTEGRATION" ] ; then
  exit 0
fi

check_dep()
{
  DEP=$1
  if [ -z $(which $DEP) ] ; then
    echo "$DEP is missing. Skipping ${THIS}."
    exit 0
  fi
}

# Check whether dependencies are present in base system (we do not bundle these)
# http://cgit.freedesktop.org/xdg/desktop-file-utils/
check_dep desktop-file-validate
check_dep update-desktop-database
check_dep desktop-file-install
check_dep xdg-icon-resource
check_dep xdg-mime
check_dep xdg-desktop-menu

DESKTOPFILE=$(find "$APPDIR" -maxdepth 1 -name "*.desktop" | head -n 1)
echo "$DESKTOPFILE"
DESKTOPFILE_NAME=$(basename $DESKTOPFILE)

if [ ! -f "$DESKTOPFILE" ] ; then
  echo "Desktop file is missing. Please run ${THIS} from within an AppImage."
  exit 0
fi

if [ -z "$APPIMAGE" ] ; then
  APPIMAGE="$APPDIR/AppRun"
  # Not running from within an AppImage; hence using the AppRun for Exec=
fi

# Construct path to the icon according to
# http://specifications.freedesktop.org/thumbnail-spec/thumbnail-spec-latest.html
ABS_APPIMAGE=$(readlink -e "$APPIMAGE")
ICONURL="file://$ABS_APPIMAGE"
MD5=$(echo -n $ICONURL | md5sum | cut -c -32)
ICONFILE="$HOME/.cache/thumbnails/normal/$MD5.png"
if [ ! -f "$ICONFILE" ] ; then
  echo "$ICONFILE is missing. Probably not running ${THIS} from within an AppImage."
  echo "Hence falling back to using .DirIcon"
  ICONFILE="$APPDIR/.DirIcon"
fi

# $XDG_DATA_DIRS contains the default paths /usr/local/share:/usr/share
# desktop file has to be installed in an applications subdirectory
# of one of the $XDG_DATA_DIRS components
if [ -z "$XDG_DATA_DIRS" ] ; then
  echo "\$XDG_DATA_DIRS is missing. Please run ${THIS} from within an AppImage."
  exit 0
fi

# Determine where the desktop file should be installed
if [[ $EUID -ne 0 ]]; then
   DESTINATION_DIR_DESKTOP="$HOME/.local/share/applications"
   SYSTEM_WIDE=""
else
   # TODO: Check $XDG_DATA_DIRS
   DESTINATION_DIR_DESKTOP="/usr/local/share/applications"
   SYSTEM_WIDE="--mode system" # for xdg-mime and xdg-icon-resource
fi

# Check if the desktop file is already there
# and if so, whether it points to the same AppImage
if [ -e "$DESTINATION_DIR_DESKTOP/$VENDORPREFIX-$DESKTOPFILE_NAME" ] ; then
  # echo "$DESTINATION_DIR_DESKTOP/$VENDORPREFIX-$DESKTOPFILE_NAME already there"
  EXEC=$(grep "^Exec=" "$DESTINATION_DIR_DESKTOP/$VENDORPREFIX-$DESKTOPFILE_NAME" | head -n 1 | cut -d " " -f 1)
  # echo $EXEC
  if [ "Exec=$APPIMAGE" == "$EXEC" ] ; then
    exit 0
  fi
fi

# We ask the user only if we have found no reason to skip until here
if [ -z "$SKIP" ] ; then
  yesno "Install" "Should a desktop file for $APPIMAGE be installed?"
fi

APP=$(echo "$DESKTOPFILE_NAME" | sed -e 's/.desktop//g')

# If the user has agreed, rewrite and install the desktop file, and the MIME information
if [ -z "$SKIP" ] ; then
  # desktop-file-install is supposed to install .desktop files to the user's
  # applications directory when run as a non-root user,
  # and to /usr/share/applications if run as root
  # but that does not really work for me...
  desktop-file-install --rebuild-mime-info-cache \
    --vendor=$VENDORPREFIX --set-key=Exec --set-value="${APPIMAGE} %U" \
    --set-key=X-AppImage-Comment --set-value="Generated by ${THIS}" \
    --set-icon=$ICONFILE --set-key=TryExec --set-value=$APPIMAGE $DESKTOPFILE \
    --dir "$DESTINATION_DIR_DESKTOP"
  chmod a+x "$DESTINATION_DIR_DESKTOP/"*
  RESOURCE_NAME=$(echo "$VENDORPREFIX-$DESKTOPFILE_NAME" | sed -e 's/.desktop//g')
  echo $RESOURCE_NAME

  # Install the icon files for the application; TODO: scalable
  ICONS=$(find "${APPDIR}/usr/share/icons/" -wholename "*/apps/${APP}.png" || true)
  for ICON in $ICONS ; do
    ICON_SIZE=$(echo "${ICON}" | rev | cut -d "/" -f 3 | rev | cut -d "x" -f 1)
    xdg-icon-resource install --context apps --size ${ICON_SIZE} "${ICON}" "${RESOURCE_NAME}"
  done

  # Install mime type
  find "${APPDIR}/usr/share/mime/" -type f -name *xml -exec xdg-mime install $SYSTEM_WIDE --novendor {} \; || true

  # Install the icon files for the mime type; TODO: scalable
  ICONS=$(find "${APPDIR}/usr/share/icons/" -wholename "*/mimetypes/*.png" || true)
  for ICON in $ICONS ; do
    ICON_SIZE=$(echo "${ICON}" | rev | cut -d "/" -f 3 | rev | cut -d "x" -f 1)
    xdg-icon-resource install --context mimetypes --size ${ICON_SIZE} "${ICON}" $(basename $ICON | sed -e 's/.png//g')
  done

  xdg-desktop-menu forceupdate
  gtk-update-icon-cache # for MIME
fi