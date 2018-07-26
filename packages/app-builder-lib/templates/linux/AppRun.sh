#!/bin/bash
set -e

if [ ! -z "$DEBUG" ] ; then
  env
  set -x
fi

THIS="$0"
# http://stackoverflow.com/questions/3190818/
args=("$@")
NUMBER_OF_ARGS="$#"

# please do not change $VENDORPREFIX as it will allow for desktop files
# belonging to AppImages to be recognized by future AppImageKit components
# such as desktop integration daemons
VENDORPREFIX=appimagekit

if [ -z $APPDIR ] ; then
  # Find the AppDir. It is the directory that contains AppRun.
  # This assumes that this script resides inside the AppDir or a subdirectory.
  # If this script is run inside an AppImage, then the AppImage runtime likely has already set $APPDIR
  path="$(dirname "$(readlink -f "${THIS}")")"
  while [[ "$path" != "" && ! -e "$path/$1" ]]; do
    path=${path%/*}
  done
  APPDIR="$path"
fi

export PATH="${APPDIR}:${APPDIR}/usr/sbin:${PATH}"
export XDG_DATA_DIRS="./share/:/usr/share/gnome:/usr/local/share/:/usr/share/:${XDG_DATA_DIRS}"
export LD_LIBRARY_PATH="${APPDIR}/usr/lib:${LD_LIBRARY_PATH}"
export XDG_DATA_DIRS="${APPDIR}"/usr/share/:"${XDG_DATA_DIRS}":/usr/share/gnome/:/usr/local/share/:/usr/share/
export GSETTINGS_SCHEMA_DIR="${APPDIR}/usr/share/glib-2.0/schemas:${GSETTINGS_SCHEMA_DIR}"

DESKTOP_FILE="$APPDIR/{{.DesktopFileName}}"
BIN="$APPDIR/{{.ExecutableName}}"

if [ -z "$APPIMAGE_EXIT_AFTER_INSTALL" ] ; then
  trap atexit EXIT
fi

isEulaAccepted=1

atexit()
{
  if [ $isEulaAccepted == 1 ] ; then
    if [ $NUMBER_OF_ARGS -eq 0 ] ; then
      exec "$BIN"
    else
      exec "$BIN" "${args[@]}"
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

# exit immediately of one of these files is present
# (e.g., because the desktop environment wants to handle desktop integration itself)
check_prevent "$HOME/.local/share/$VENDORPREFIX/no_desktopintegration"
check_prevent "/usr/share/$VENDORPREFIX/no_desktopintegration"
check_prevent "/etc/$VENDORPREFIX/no_desktopintegration"

# exit immediately if appimaged is running
pidof appimaged 2>/dev/null && exit 0

# exit immediately if $DESKTOPINTEGRATION is not empty
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

if [ ! -f "$DESKTOP_FILE" ] ; then
  echo "Desktop file is missing. Please run ${THIS} from within an AppImage."
  exit 0
fi

if [ -z "$APPIMAGE" ] ; then
  APPIMAGE="$APPDIR/AppRun"
  # not running from within an AppImage; hence using the AppRun for Exec=
fi

# determine where the desktop file should be installed
if [[ $EUID -ne 0 ]]; then
   DESTINATION_DIR_DESKTOP="$HOME/.local/share/applications"
   SYSTEM_WIDE=""
else
   DESTINATION_DIR_DESKTOP="/usr/local/share/applications"
   # for xdg-mime and xdg-icon-resource
   SYSTEM_WIDE="--mode system"
fi

desktopFilePath="$DESTINATION_DIR_DESKTOP/$VENDORPREFIX-{{.DesktopFileName}}"

# check if the desktop file is already there and if so, whether it points to the same AppImage
if [ -e "$desktopFilePath" ] ; then
  INSTALLED_APP_VERSION=$(grep "^X-AppImage-BuildId=" "$DESTINATION_DIR_DESKTOP/$VENDORPREFIX-{{.DesktopFileName}}" | head -n 1 | cut -d " " -f 1)
  APP_VERSION=$(grep "^X-AppImage-BuildId=" "$DESKTOP_FILE" | head -n 1 | cut -d " " -f 1)
  #echo "installed: $INSTALLED_APP_VERSION image: $APP_VERSION"
  if [ "$INSTALLED_APP_VERSION" == "$APP_VERSION" ] ; then
    exit 0
  fi
fi

{{if .EulaFile}}
if [ -z "$APPIMAGE_SILENT_INSTALL" ] ; then
  # show EULA only if desktop file doesn't exist
  if [ ! -e "$desktopFilePath" ] ; then
    if [ -x /usr/bin/zenity ] ; then
      # on cancel simply exits and our trap handler launches app, so, $isEulaAccepted is set here to 0 and then to 1 if EULA accepted
      isEulaAccepted=0
      LD_LIBRARY_PATH="" zenity --text-info --title="{{.ProductName}}" --filename="$APPDIR/{{.EulaFile}}" --ok-label=Agree --cancel-label=Disagree {{if .IsHtmlEula}}--html{{end}}
      echo "r: $?"
    elif [ -x /usr/bin/kdialog ] ; then
      # cannot find any option to force Agree/Disagree buttons for kdialog. And official example exactly with OK button https://techbase.kde.org/Development/Tutorials/Shell_Scripting_with_KDE_Dialogs#Example_21._--textbox_dialog_box
      # in any case we pass labels text
      LD_LIBRARY_PATH="" kdialog --textbox "$APPDIR/{{.EulaFile}}" --yes-label Agree --cancel-label "Disagree"
    fi

    case $? in
      0)
          isEulaAccepted=1
          echo "License accepted"
      ;;
        1)
          echo "License not accepted"
          exit 0
      ;;
        -1)
          echo "An unexpected error has occurred."
          isEulaAccepted=1
      ;;
    esac
  fi
fi
{{end}}

{{if eq .SystemIntegration "ask"}}
if [ -z "$APPIMAGE_SILENT_INSTALL" ] ; then
    # we ask the user only if we have found no reason to skip until here
    yesno "Install" "Would you like to integrate $APPIMAGE with your system?\n\nThis will add it to your applications menu and install icons.\nIf you don't do this you can still launch the application by double-clicking on the AppImage."
fi
{{end}}

# check whether dependencies are present in base system (we do not bundle these)
# http://cgit.freedesktop.org/xdg/desktop-file-utils/
check_dep desktop-file-install
check_dep xdg-icon-resource
check_dep xdg-mime
check_dep xdg-desktop-menu

desktop-file-install --rebuild-mime-info-cache \
  --vendor=$VENDORPREFIX --set-key=Exec --set-value="\"${APPIMAGE}\" %U" \
  --set-key=X-AppImage-Comment --set-value="Generated by ${THIS}" \
  --set-icon="{{.ResourceName}}" --set-key=TryExec --set-value=${APPIMAGE// /\\s} "$DESKTOP_FILE" \
  --dir "$DESTINATION_DIR_DESKTOP" \
  --mode=755

# uninstall previous icons
xdg-icon-resource uninstall --noupdate --size 16 "{{.ResourceName}}"
xdg-icon-resource uninstall --noupdate --size 24 "{{.ResourceName}}"
xdg-icon-resource uninstall --noupdate --size 32 "{{.ResourceName}}"
xdg-icon-resource uninstall --noupdate --size 48 "{{.ResourceName}}"
xdg-icon-resource uninstall --noupdate --size 64 "{{.ResourceName}}"
xdg-icon-resource uninstall --noupdate --size 72 "{{.ResourceName}}"
xdg-icon-resource uninstall --noupdate --size 96 "{{.ResourceName}}"
xdg-icon-resource uninstall --noupdate --size 128 "{{.ResourceName}}"
xdg-icon-resource uninstall --noupdate --size 256 "{{.ResourceName}}"
xdg-icon-resource uninstall --noupdate --size 512 "{{.ResourceName}}"
xdg-icon-resource uninstall --noupdate --size 1024 "{{.ResourceName}}"

# install the icon files
{{range $index, $icon := .Icons}}
xdg-icon-resource install --noupdate --context apps --size {{$icon.Size}} "$APPDIR/{{$icon.File}}" "{{$.ResourceName}}"
{{end}}

{{if .MimeTypeFile}}
xdg-mime install $SYSTEM_WIDE --novendor "$APPDIR/{{.MimeTypeFile}}"
{{end}}

xdg-icon-resource forceupdate

# Install the icon files for the mime type
ICONS=$(find "${APPDIR}/usr/share/icons/" -wholename "*/mimetypes/*.png" 2>/dev/null || true)
for ICON in $ICONS ; do
  ICON_SIZE=$(echo "${ICON}" | rev | cut -d "/" -f 3 | rev | cut -d "x" -f 1)
  xdg-icon-resource install --context mimetypes --size ${ICON_SIZE} "${ICON}" $(basename $ICON | sed -e 's/.png//g')
done

xdg-desktop-menu forceupdate
# for MIME
gtk-update-icon-cache
