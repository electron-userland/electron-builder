#!/bin/bash

set -e

# Be verbose if $DEBUG=1 is set
if [ ! -z "$DEBUG" ] ; then
  env
  set -x
fi

THIS="$0"
args=("$@") # http://stackoverflow.com/questions/3190818/
NUMBER_OF_ARGS="$#"

# Please do not change $VENDORPREFIX as it will allow for desktop files
# belonging to AppImages to be recognized by future AppImageKit components
# such as desktop integration daemons
VENDORPREFIX=appimagekit

find-up () {
  path="$(dirname "$(readlink -f "${THIS}")")"
  while [[ "$path" != "" && ! -e "$path/$1" ]]; do
    path=${path%/*}
  done
  # echo "$path"
}

if [ -z $APPDIR ] ; then
  # Find the AppDir. It is the directory that contains AppRun.
  # This assumes that this script resides inside the AppDir or a subdirectory.
  # If this script is run inside an AppImage, then the AppImage runtime
  # likely has already set $APPDIR
  APPDIR=$(find-up "AppRun")
fi

export PATH="${APPDIR}/app:${APPDIR}/usr/sbin:${PATH}"
export XDG_DATA_DIRS="./share/:/usr/share/gnome:/usr/local/share/:/usr/share/:${XDG_DATA_DIRS}"
export LD_LIBRARY_PATH="${APPDIR}/usr/lib:${LD_LIBRARY_PATH}"
export XDG_DATA_DIRS="${APPDIR}"/usr/share/:"${XDG_DATA_DIRS}":/usr/share/gnome/:/usr/local/share/:/usr/share/
export GSETTINGS_SCHEMA_DIR="${APPDIR}/usr/share/glib-2.0/schemas:${GSETTINGS_SCHEMA_DIR}"

DESKTOP_FILE="$APPDIR/<%= desktopFileName %>"
BIN="$APPDIR/app/<%= executableName %>"

trap atexit EXIT

# Note that the following handles 0, 1 or more arguments (file paths)
# which can include blanks but uses a bashism; can the same be achieved
# in POSIX-shell? (FIXME)
# http://stackoverflow.com/questions/3190818
atexit()
{

if [ ! -z "$APPIMAGE_DELETE_OLD_FILE" ] ; then
  echo "Delete old file $APPIMAGE_DELETE_OLD_FILE"
  rm -f "$APPIMAGE_DELETE_OLD_FILE"
fi

if [ -z "$APPIMAGE_EXIT_AFTER_INSTALL" ] ; then
  if [ $NUMBER_OF_ARGS -eq 0 ] ; then
    exec "${BIN}"
  else
    exec "${BIN}" "${args[@]}"
  fi
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
    LD_LIBRARY_PATH="" zenity --question --title="$TITLE" --text="$TEXT" 2>/dev/null || exit 0
  elif [ -x /usr/bin/kdialog ] ; then
    LD_LIBRARY_PATH="" kdialog --title "$TITLE" --yesno "$TEXT" || exit 0
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
check_dep desktop-file-install
check_dep xdg-icon-resource
check_dep xdg-mime
check_dep xdg-desktop-menu

if [ ! -f "$DESKTOP_FILE" ] ; then
  echo "Desktop file is missing. Please run ${THIS} from within an AppImage."
  exit 0
fi

if [ -z "$APPIMAGE" ] ; then
  APPIMAGE="$APPDIR/AppRun"
  # Not running from within an AppImage; hence using the AppRun for Exec=
fi

# Determine where the desktop file should be installed
if [[ $EUID -ne 0 ]]; then
   DESTINATION_DIR_DESKTOP="$HOME/.local/share/applications"
   SYSTEM_WIDE=""
else
   DESTINATION_DIR_DESKTOP="/usr/local/share/applications"
   # for xdg-mime and xdg-icon-resource
   SYSTEM_WIDE="--mode system"
fi

# Check if the desktop file is already there
# and if so, whether it points to the same AppImage
if [ -e "$DESTINATION_DIR_DESKTOP/$VENDORPREFIX-<%= desktopFileName %>" ] ; then
  INSTALLED_APP_VERSION=$(grep "^X-AppImage-BuildId=" "$DESTINATION_DIR_DESKTOP/$VENDORPREFIX-<%= desktopFileName %>" | head -n 1 | cut -d " " -f 1)
  APP_VERSION=$(grep "^X-AppImage-BuildId=" "$DESKTOP_FILE" | head -n 1 | cut -d " " -f 1)
  echo "installed: $INSTALLED_APP_VERSION image: $APP_VERSION"
  if [ "$INSTALLED_APP_VERSION" == "$APP_VERSION" ] ; then
    exit 0
  fi
fi

<% if (systemIntegration === "ask") { %>

# we ask the user only if we have found no reason to skip until here
if [ -z "$APPIMAGE_SILENT_INSTALL" ] ; then
  yesno "Install" "Would you like to integrate $APPIMAGE with your system?\n\nThis will add it to your applications menu and install icons.\nIf you don't do this you can still launch the application by double-clicking on the AppImage."
fi

<% } %>

# desktop-file-install is supposed to install .desktop files to the user's
# applications directory when run as a non-root user,
# and to /usr/share/applications if run as root
# but that does not really work for me...
desktop-file-install --rebuild-mime-info-cache \
  --vendor=$VENDORPREFIX --set-key=Exec --set-value="\"${APPIMAGE}\" %U" \
  --set-key=X-AppImage-Comment --set-value="Generated by ${THIS}" \
  --set-icon="<%= resourceName %>" --set-key=TryExec --set-value=${APPIMAGE// /\\s} "$DESKTOP_FILE" \
  --dir "$DESTINATION_DIR_DESKTOP"
chmod a+x "$DESTINATION_DIR_DESKTOP/"*

# uninstall previous icons
xdg-icon-resource uninstall --noupdate --size 16 "<%= resourceName %>"
xdg-icon-resource uninstall --noupdate --size 24 "<%= resourceName %>"
xdg-icon-resource uninstall --noupdate --size 32 "<%= resourceName %>"
xdg-icon-resource uninstall --noupdate --size 48 "<%= resourceName %>"
xdg-icon-resource uninstall --noupdate --size 64 "<%= resourceName %>"
xdg-icon-resource uninstall --noupdate --size 72 "<%= resourceName %>"
xdg-icon-resource uninstall --noupdate --size 96 "<%= resourceName %>"
xdg-icon-resource uninstall --noupdate --size 128 "<%= resourceName %>"
xdg-icon-resource uninstall --noupdate --size 256 "<%= resourceName %>"
xdg-icon-resource uninstall --noupdate --size 512 "<%= resourceName %>"
xdg-icon-resource uninstall --noupdate --size 1024 "<%= resourceName %>"

# Install the icon files for the application
<%- installIcons %>

xdg-icon-resource forceupdate

# Install mime type
find "${APPDIR}/usr/share/mime/" -type f -name *xml -exec xdg-mime install $SYSTEM_WIDE --novendor {} \; 2>/dev/null || true

# Install the icon files for the mime type; TODO: scalable
ICONS=$(find "${APPDIR}/usr/share/icons/" -wholename "*/mimetypes/*.png" 2>/dev/null || true)
for ICON in $ICONS ; do
  ICON_SIZE=$(echo "${ICON}" | rev | cut -d "/" -f 3 | rev | cut -d "x" -f 1)
  xdg-icon-resource install --context mimetypes --size ${ICON_SIZE} "${ICON}" $(basename $ICON | sed -e 's/.png//g')
done

xdg-desktop-menu forceupdate
# for MIME
gtk-update-icon-cache
