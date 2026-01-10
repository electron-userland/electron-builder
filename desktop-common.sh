#!/bin/bash -e

###############################################
# Launcher common exports for any desktop app #
###############################################

function prepend_dir() {
  local var="$1"
  local dir="$2"
  if [ -d "$dir" ]; then
    eval "export $var=\"\$dir\${$var:+:\$$var}\""
  fi
}

function append_dir() {
  local var="$1"
  local dir="$2"
  if [ -d "$dir" ]; then
    eval "export $var=\"\${$var:+\$$var:}\$dir\""
  fi
}

function can_open_file() {
  head -c0 "$1" &> /dev/null
}

function update_xdg_dirs_values() {
  local save_initial_values=false
  local XDG_DIRS="DOCUMENTS DESKTOP DOWNLOAD MUSIC PICTURES VIDEOS PUBLICSHARE TEMPLATES"
  unset XDG_SPECIAL_DIRS_PATHS

  if [ -f "${XDG_CONFIG_HOME:-$HOME/.config}/user-dirs.dirs" ]; then
    # shellcheck source=/dev/null
    source "${XDG_CONFIG_HOME:-$HOME/.config}/user-dirs.dirs"
  fi

  if [ -z ${XDG_SPECIAL_DIRS+x} ]; then
    save_initial_values=true
  fi

  for d in $XDG_DIRS; do
    var="XDG_${d}_DIR"
    value="${!var}"

    if [ "$save_initial_values" = true ]; then
      XDG_SPECIAL_DIRS+=("$var")
      if [ -n "$value" ]; then
        XDG_SPECIAL_DIRS_INITIAL_PATHS+=("$value")
      fi
    fi

    if [ -n "$value" ]; then
      XDG_SPECIAL_DIRS_PATHS+=("$value")
    fi
  done
}

function is_subpath() {
  dir="$(realpath "$1")"
  parent="$(realpath "$2")"
  [ "${dir##$parent/}" != "$dir" ] && return 0 || return 1
}

if [ -n "$SNAP_DESKTOP_RUNTIME" ]; then
  # add general paths not added by snapcraft due to runtime snap
  append_dir LD_LIBRARY_PATH "$SNAP_DESKTOP_RUNTIME/lib/$SNAP_DESKTOP_ARCH_TRIPLET"
  append_dir LD_LIBRARY_PATH "$SNAP_DESKTOP_RUNTIME/usr/lib/$SNAP_DESKTOP_ARCH_TRIPLET"
  append_dir PATH "$SNAP_DESKTOP_RUNTIME/usr/bin"
fi

# XKB config
export XKB_CONFIG_ROOT="$SNAP_DESKTOP_RUNTIME/usr/share/X11/xkb"

# Give XOpenIM a chance to locate locale data.
# This is required for text input to work in SDL2 games.
export XLOCALEDIR="$SNAP_DESKTOP_RUNTIME/usr/share/X11/locale"

# Set XCursors path
export XCURSOR_PATH="$SNAP_DESKTOP_RUNTIME/usr/share/icons"
prepend_dir XCURSOR_PATH "$SNAP/data-dir/icons"

# Mesa Libs for OpenGL support
append_dir LD_LIBRARY_PATH "$SNAP_DESKTOP_RUNTIME/usr/lib/$SNAP_DESKTOP_ARCH_TRIPLET/mesa"
append_dir LD_LIBRARY_PATH "$SNAP_DESKTOP_RUNTIME/usr/lib/$SNAP_DESKTOP_ARCH_TRIPLET/mesa-egl"

# Tell libGL where to find the drivers
export LIBGL_DRIVERS_PATH="$SNAP_DESKTOP_RUNTIME/usr/lib/$SNAP_DESKTOP_ARCH_TRIPLET/dri"
append_dir LD_LIBRARY_PATH "$LIBGL_DRIVERS_PATH"
export LIBVA_DRIVERS_PATH=$SNAP_DESKTOP_RUNTIME/usr/lib/$ARCH/dri

# Workaround in snapd for proprietary nVidia drivers mounts the drivers in
# /var/lib/snapd/lib/gl that needs to be in LD_LIBRARY_PATH
# Without that OpenGL using apps do not work with the nVidia drivers.
# Ref.: https://bugs.launchpad.net/snappy/+bug/1588192
append_dir LD_LIBRARY_PATH /var/lib/snapd/lib/gl

# Unity7 export (workaround for https://launchpad.net/bugs/1638405)
append_dir LD_LIBRARY_PATH "$SNAP_DESKTOP_RUNTIME/usr/lib/$SNAP_DESKTOP_ARCH_TRIPLET/libunity"

# Pulseaudio export
append_dir LD_LIBRARY_PATH "$SNAP_DESKTOP_RUNTIME/usr/lib/$SNAP_DESKTOP_ARCH_TRIPLET/pulseaudio"

# EGL vendor files on glvnd enabled systems
[ -d /var/lib/snapd/lib/glvnd/egl_vendor.d ] && \
    append_dir __EGL_VENDOR_LIBRARY_DIRS /var/lib/snapd/lib/glvnd/egl_vendor.d

# Tell GStreamer where to find its plugins
export GST_PLUGIN_PATH="$SNAP/usr/lib/$SNAP_DESKTOP_ARCH_TRIPLET/gstreamer-1.0"
export GST_PLUGIN_SYSTEM_PATH="$SNAP_DESKTOP_RUNTIME/usr/lib/$SNAP_DESKTOP_ARCH_TRIPLET/gstreamer-1.0"
# gst plugin scanner doesn't install in the correct path: https://github.com/ubuntu/snapcraft-desktop-helpers/issues/43
export GST_PLUGIN_SCANNER="$SNAP_DESKTOP_RUNTIME/usr/lib/$SNAP_DESKTOP_ARCH_TRIPLET/gstreamer1.0/gstreamer-1.0/gst-plugin-scanner"

# XDG Config
[ -n "$SNAP_DESKTOP_RUNTIME" ] && prepend_dir XDG_CONFIG_DIRS "$SNAP_DESKTOP_RUNTIME/etc/xdg"
prepend_dir XDG_CONFIG_DIRS "$SNAP/etc/xdg"

# Define snaps' own data dir
[ -n "$SNAP_DESKTOP_RUNTIME" ] && prepend_dir XDG_DATA_DIRS "$SNAP_DESKTOP_RUNTIME/usr/share"
prepend_dir XDG_DATA_DIRS "$SNAP/usr/share"
prepend_dir XDG_DATA_DIRS "$SNAP/share"
prepend_dir XDG_DATA_DIRS "$SNAP/data-dir"
prepend_dir XDG_DATA_DIRS "$SNAP_USER_DATA"

# Set XDG_DATA_HOME to local path
export XDG_DATA_HOME="$SNAP_USER_DATA/.local/share"
mkdir -p "$XDG_DATA_HOME"

# Workaround for GLib < 2.53.2 not searching for schemas in $XDG_DATA_HOME:
#   https://bugzilla.gnome.org/show_bug.cgi?id=741335
prepend_dir XDG_DATA_DIRS "$XDG_DATA_HOME"

# Set cache folder to local path
export XDG_CACHE_HOME="$SNAP_USER_COMMON/.cache"
if [[ -d "$SNAP_USER_DATA/.cache" && ! -e "$XDG_CACHE_HOME" ]]; then
  # the .cache directory used to be stored under $SNAP_USER_DATA, migrate it
  mv "$SNAP_USER_DATA/.cache" "$SNAP_USER_COMMON/"
fi
mkdir -p "$XDG_CACHE_HOME"

# Set config folder to local path
export XDG_CONFIG_HOME="$SNAP_USER_DATA/.config"
mkdir -p "$XDG_CONFIG_HOME"

# Create $XDG_RUNTIME_DIR if not exists (to be removed when LP: #1656340 is fixed)
if [ -n "$XDG_RUNTIME_DIR" ]; then
  mkdir -p "$XDG_RUNTIME_DIR"
  chmod 700 "$XDG_RUNTIME_DIR"
fi

# Ensure the app finds locale definitions (requires locales-all to be installed)
append_dir LOCPATH "$SNAP_DESKTOP_RUNTIME/usr/lib/locale"

# If any, keep track of where XDG dirs were so we can potentially migrate the content later
update_xdg_dirs_values

# Setup user-dirs.* or run xdg-user-dirs-update if needed
needs_xdg_update=false
needs_xdg_reload=false
needs_xdg_links=false

if [ "$HOME" != "$SNAP_USER_DATA" ] && ! is_subpath "$XDG_CONFIG_HOME" "$HOME"; then
  for f in user-dirs.dirs user-dirs.locale; do
    if [ -f "$HOME/.config/$f" ]; then
      mv "$HOME/.config/$f" "$XDG_CONFIG_HOME"
      needs_xdg_reload=true
    fi
  done
fi

if can_open_file "$REALHOME/.config/user-dirs.dirs" && can_open_file "$REALHOME/.config/user-dirs.locale"; then
  if [ "$SNAP_DESKTOP_COMPONENTS_NEED_UPDATE" = "true" ] || [ $needs_xdg_reload = true ]; then
    sed "/^#/!s#\$HOME#${REALHOME}#g" "$REALHOME/.config/user-dirs.dirs" > "$XDG_CONFIG_HOME/user-dirs.dirs"
    cp -a "$REALHOME/.config/user-dirs.locale" "$XDG_CONFIG_HOME"
    for f in user-dirs.dirs user-dirs.locale; do
      md5sum < "$REALHOME/.config/$f" > "$XDG_CONFIG_HOME/$f.md5sum"
    done
    needs_xdg_reload=true
  fi
else
  needs_xdg_update=true
  needs_xdg_links=true
fi

if [ $needs_xdg_reload = true ]; then
  update_xdg_dirs_values
  needs_xdg_reload=false
fi

# Check if we can actually read the contents of each xdg dir
for ((i = 0; i < ${#XDG_SPECIAL_DIRS_PATHS[@]}; i++)); do
  if ! can_open_file "${XDG_SPECIAL_DIRS_PATHS[$i]}"; then
    needs_xdg_update=true
    needs_xdg_links=true
    break
  fi
done

# If needs XDG update and xdg-user-dirs-update exists in $PATH, run it
if [ $needs_xdg_update = true ] && command -v xdg-user-dirs-update >/dev/null; then
  xdg-user-dirs-update
  update_xdg_dirs_values
fi

# Create links for user-dirs.dirs
if [ $needs_xdg_links = true ]; then
  for ((i = 0; i < ${#XDG_SPECIAL_DIRS_PATHS[@]}; i++)); do
    b="$(realpath "${XDG_SPECIAL_DIRS_PATHS[$i]}" --relative-to="$HOME")"
    if [ -e "$REALHOME/$b" ]; then
      if [ -d "$HOME/$b" ]; then
        rmdir "$HOME/$b" 2> /dev/null
      fi
      if [ ! -e "$HOME/$b" ]; then
        ln -s "$REALHOME/$b" "$HOME/$b"
      fi
    fi
  done
else
  # If we aren't creating new links, check if we have content saved in old locations and move it
  for ((i = 0; i < ${#XDG_SPECIAL_DIRS[@]}; i++)); do
    old="${XDG_SPECIAL_DIRS_INITIAL_PATHS[$i]}"
    new="${XDG_SPECIAL_DIRS_PATHS[$i]}"
    if [ -L "$old" ] && [ -d "$new" ] && [ "$(readlink "$old")" != "$new" ]; then
      mv -vn "$old"/* "$new"/ 2>/dev/null
    elif [ -d "$old" ] && [ -d "$new" ] && [ "$old" != "$new" ] &&
         (is_subpath "$old" "$SNAP_USER_DATA" || is_subpath "$old" "$SNAP_USER_COMMON"); then
      mv -vn "$old"/* "$new"/ 2>/dev/null
    fi
  done
fi

# If detect wayland server socket, then set environment so applications prefer
# wayland, and setup compat symlink (until we use user mounts. Remember,
# XDG_RUNTIME_DIR is /run/user/<uid>/snap.$SNAP so look in the parent directory
# for the socket. For details:
# https://forum.snapcraft.io/t/wayland-dconf-and-xdg-runtime-dir/186/10
# Applications that don't support wayland natively may define DISABLE_WAYLAND
# (to any non-empty value) to skip that logic entirely.
SNAP_DESKTOP_WAYLAND_AVAILABLE=false
if [[ -n "$XDG_RUNTIME_DIR" && -z "$DISABLE_WAYLAND" ]]; then
    wdisplay="wayland-0"
    if [ -n "$WAYLAND_DISPLAY" ]; then
        wdisplay="$WAYLAND_DISPLAY"
    fi
    wayland_sockpath="$XDG_RUNTIME_DIR/../$wdisplay"
    wayland_snappath="$XDG_RUNTIME_DIR/$wdisplay"
    if [ -S "$wayland_sockpath" ]; then
        # if running under wayland, use it
        #export WAYLAND_DEBUG=1
        SNAP_DESKTOP_WAYLAND_AVAILABLE=true
        # create the compat symlink for now
        if [ ! -e "$wayland_snappath" ]; then
            ln -s "$wayland_sockpath" "$wayland_snappath"
        fi
    fi
fi

# Make PulseAudio socket available inside the snap-specific $XDG_RUNTIME_DIR
if [ -n "$XDG_RUNTIME_DIR" ]; then
    pulsenative="pulse/native"
    pulseaudio_sockpath="$XDG_RUNTIME_DIR/../$pulsenative"
    if [ -S "$pulseaudio_sockpath" ]; then
        export PULSE_SERVER="unix:${pulseaudio_sockpath}"
    fi
fi

# GI repository
[ -n "$SNAP_DESKTOP_RUNTIME" ] && prepend_dir GI_TYPELIB_PATH "$SNAP_DESKTOP_RUNTIME/usr/lib/$SNAP_DESKTOP_ARCH_TRIPLET/girepository-1.0"
[ -n "$SNAP_DESKTOP_RUNTIME" ] && prepend_dir GI_TYPELIB_PATH "$SNAP_DESKTOP_RUNTIME/usr/lib/girepository-1.0"
prepend_dir GI_TYPELIB_PATH "$SNAP/usr/lib/$SNAP_DESKTOP_ARCH_TRIPLET/girepository-1.0"
prepend_dir GI_TYPELIB_PATH "$SNAP/usr/lib/girepository-1.0"
prepend_dir GI_TYPELIB_PATH "$SNAP/usr/lib/gjs/girepository-1.0"

# Keep an array of data dirs, for looping through them
IFS=':' read -r -a data_dirs_array <<< "$XDG_DATA_DIRS"

# Font Config and themes
export FONTCONFIG_PATH="$SNAP_DESKTOP_RUNTIME/etc/fonts"
export FONTCONFIG_FILE="$SNAP_DESKTOP_RUNTIME/etc/fonts/fonts.conf"

function make_user_fontconfig {
  echo "<fontconfig>"
  if [ -d "$REALHOME/.local/share/fonts" ]; then
    echo "  <dir>$REALHOME/.local/share/fonts</dir>"
  fi
  if [ -d "$REALHOME/.fonts" ]; then
    echo "  <dir>$REALHOME/.fonts</dir>"
  fi
  for ((i = 0; i < ${#data_dirs_array[@]}; i++)); do
    if [ -d "${data_dirs_array[$i]}/fonts" ]; then
      echo "  <dir>${data_dirs_array[$i]}/fonts</dir>"
    fi
  done
  echo '  <include ignore_missing="yes">conf.d</include>'
  # We need to include this default cachedir first so that caching
  # works: without it, fontconfig will try to write to the real user home
  # cachedir and be blocked by AppArmor.
  echo '  <cachedir prefix="xdg">fontconfig</cachedir>'
  if [ -d "$REALHOME/.cache/fontconfig" ]; then
    echo "  <cachedir>$REALHOME/.cache/fontconfig</cachedir>"
  fi
  echo "</fontconfig>"
}

if [ "$SNAP_DESKTOP_COMPONENTS_NEED_UPDATE" = "true" ]; then
  rm -rf "$XDG_DATA_HOME"/{fontconfig,fonts,fonts-*,themes,.themes}

  # This fontconfig fragment is installed in a location that is
  # included by the system fontconfig configuration: namely the
  # etc/fonts/conf.d/50-user.conf file.
  mkdir -p "$XDG_CONFIG_HOME/fontconfig"
  make_user_fontconfig > "$XDG_CONFIG_HOME/fontconfig/fonts.conf"

  # the themes symlink are needed for GTK 3.18 when the prefix isn't changed
  # GTK 3.20 looks into XDG_DATA_DIR which has connected themes.
  ln -sf "$SNAP/data-dir/themes" "$XDG_DATA_HOME"
  ln -sfn "$SNAP/data-dir/themes" "$SNAP_USER_DATA/.themes"
fi

# Build mime.cache
# needed for gtk and qt icon
if [ "$SNAP_DESKTOP_COMPONENTS_NEED_UPDATE" = "true" ]; then
  rm -rf "$XDG_DATA_HOME/mime"
  if [ ! -f "$SNAP_DESKTOP_RUNTIME/usr/share/mime/mime.cache" ]; then
    if command -v update-mime-database >/dev/null; then
      cp --preserve=timestamps -dR "$SNAP_DESKTOP_RUNTIME/usr/share/mime" "$XDG_DATA_HOME"
      update-mime-database "$XDG_DATA_HOME/mime"
    fi
  fi
fi

# Gio modules and cache (including gsettings module)
export GIO_MODULE_DIR="$XDG_CACHE_HOME/gio-modules"
if [ "$SNAP_DESKTOP_COMPONENTS_NEED_UPDATE" = "true" ]; then
  if [ -f "$SNAP_DESKTOP_RUNTIME/usr/lib/$SNAP_DESKTOP_ARCH_TRIPLET/glib-2.0/gio-querymodules" ]; then
    rm -rf "$GIO_MODULE_DIR"
    mkdir -p "$GIO_MODULE_DIR"
    ln -sf "$SNAP_DESKTOP_RUNTIME/usr/lib/$SNAP_DESKTOP_ARCH_TRIPLET/gio/modules/"*.so "$GIO_MODULE_DIR"
    ln -sf "$SNAP/usr/lib/$SNAP_DESKTOP_ARCH_TRIPLET/gio/modules/"*.so "$GIO_MODULE_DIR"
    "$SNAP_DESKTOP_RUNTIME/usr/lib/$SNAP_DESKTOP_ARCH_TRIPLET/glib-2.0/gio-querymodules" "$GIO_MODULE_DIR"
  fi
fi

# Setup compiled gsettings schema
GS_SCHEMA_DIR="$XDG_DATA_HOME/glib-2.0/schemas"
function compile_schemas {
  if [ -f "$1" ]; then
    rm -rf "$GS_SCHEMA_DIR"
    mkdir -p "$GS_SCHEMA_DIR"
    for ((i = 0; i < ${#data_dirs_array[@]}; i++)); do
      schema_dir="${data_dirs_array[$i]}/glib-2.0/schemas"
      if [ -f "$schema_dir/gschemas.compiled" ]; then
        # This directory already has compiled schemas
        continue
      fi
      if [ -n "$(ls -A "$schema_dir"/*.xml 2>/dev/null)" ]; then
        ln -s "$schema_dir"/*.xml "$GS_SCHEMA_DIR"
      fi
      if [ -n "$(ls -A "$schema_dir"/*.override 2>/dev/null)" ]; then
        ln -s "$schema_dir"/*.override "$GS_SCHEMA_DIR"
      fi
    done
    # Only compile schemas if we copied anything
    if [ -n "$(ls -A "$GS_SCHEMA_DIR"/*.xml "$GS_SCHEMA_DIR"/*.override 2>/dev/null)" ]; then
      "$1" "$GS_SCHEMA_DIR"
    fi
  fi
}
if [ "$SNAP_DESKTOP_COMPONENTS_NEED_UPDATE" = "true" ]; then
  compile_schemas "$SNAP_DESKTOP_RUNTIME/usr/lib/$SNAP_DESKTOP_ARCH_TRIPLET/glib-2.0/glib-compile-schemas"
fi

# Enable gsettings user changes
# symlink the dconf file if home plug is connected for read
DCONF_DEST_USER_DIR="$SNAP_USER_DATA/.config/dconf"
if [ ! -f "$DCONF_DEST_USER_DIR/user" ]; then
  if [ -f "$REALHOME/.config/dconf/user" ]; then
    mkdir -p "$DCONF_DEST_USER_DIR"
    ln -s "$REALHOME/.config/dconf/user" "$DCONF_DEST_USER_DIR"
  fi
fi

# Testability support
append_dir LD_LIBRARY_PATH "$SNAP/testability"
append_dir LD_LIBRARY_PATH "$SNAP/testability/$SNAP_DESKTOP_ARCH_TRIPLET"
append_dir LD_LIBRARY_PATH "$SNAP/testability/$SNAP_DESKTOP_ARCH_TRIPLET/mesa"

# Gdk-pixbuf loaders
export GDK_PIXBUF_MODULE_FILE=$XDG_CACHE_HOME/gdk-pixbuf-loaders.cache
export GDK_PIXBUF_MODULEDIR=$SNAP_DESKTOP_RUNTIME/usr/lib/$SNAP_DESKTOP_ARCH_TRIPLET/gdk-pixbuf-2.0/2.10.0/loaders
if [ "$SNAP_DESKTOP_COMPONENTS_NEED_UPDATE" = "true" ]; then
  rm -f "$GDK_PIXBUF_MODULE_FILE"
  if [ -f "$SNAP_DESKTOP_RUNTIME/usr/lib/$SNAP_DESKTOP_ARCH_TRIPLET/gdk-pixbuf-2.0/gdk-pixbuf-query-loaders" ]; then
    "$SNAP_DESKTOP_RUNTIME/usr/lib/$SNAP_DESKTOP_ARCH_TRIPLET/gdk-pixbuf-2.0/gdk-pixbuf-query-loaders" > "$GDK_PIXBUF_MODULE_FILE"
  fi
fi

# Icon themes cache
if [ "$SNAP_DESKTOP_COMPONENTS_NEED_UPDATE" = "true" ]; then
  rm -rf "$XDG_DATA_HOME/icons"
  mkdir -p "$XDG_DATA_HOME/icons"
  for ((i = 0; i < ${#data_dirs_array[@]}; i++)); do
    for theme in "${data_dirs_array[$i]}/icons/"*; do
      if [ -f "$theme/index.theme" ] && [ ! -f "$theme/icon-theme.cache" ]; then
        theme_dir="$XDG_DATA_HOME/icons/$(basename "$theme")"
        if [ ! -d "$theme_dir" ]; then
          mkdir -p "$theme_dir"
          ln -s "$theme"/* "$theme_dir"
          if [ -f "$SNAP_DESKTOP_RUNTIME/usr/sbin/update-icon-caches" ]; then
            "$SNAP_DESKTOP_RUNTIME/usr/sbin/update-icon-caches" "$theme_dir"
          elif [ -f "$SNAP_DESKTOP_RUNTIME/usr/sbin/update-icon-cache.gtk2" ]; then
            "$SNAP_DESKTOP_RUNTIME/usr/sbin/update-icon-cache.gtk2" "$theme_dir"
          fi
        fi
      fi
    done
  done
fi

# GTK theme and behavior modifier
# Those can impact the theme engine used by Qt as well
gtk_configs=(gtk-3.0/settings.ini gtk-3.0/bookmarks gtk-2.0/gtkfilechooser.ini)
for f in "${gtk_configs[@]}"; do
  dest="$XDG_CONFIG_HOME/$f"
  if [ ! -L "$dest" ]; then
    mkdir -p "$(dirname "$dest")"
    ln -s "$REALHOME/.config/$f" "$dest"
  fi
done

# create symbolic link to ibus socket path for ibus to look up its socket files
# (see comments #3 and #6 on https://launchpad.net/bugs/1580463)
IBUS_CONFIG_PATH="$XDG_CONFIG_HOME/ibus"
mkdir -p "$IBUS_CONFIG_PATH"
[ -d "$IBUS_CONFIG_PATH/bus" ] && rm -rf "$IBUS_CONFIG_PATH/bus"
ln -sfn "$REALHOME/.config/ibus/bus" "$IBUS_CONFIG_PATH"

export SNAP_DESKTOP_WAYLAND_AVAILABLE

exec "$@"