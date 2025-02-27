#!/bin/bash -e

##############################
# GTK launcher specific part #
##############################

if [ "$SNAP_DESKTOP_WAYLAND_AVAILABLE" = "true" ]; then
  export GDK_BACKEND="wayland"
  export CLUTTER_BACKEND="wayland"
  # Does not hurt to specify this as well, just in case
  export QT_QPA_PLATFORM=wayland-egl
fi

export GTK_PATH="$SNAP_DESKTOP_RUNTIME/usr/lib/$SNAP_DESKTOP_ARCH_TRIPLET/gtk-3.0"

# ibus and fcitx integration
GTK_IM_MODULE_DIR=$XDG_CACHE_HOME/immodules
export GTK_IM_MODULE_FILE=$GTK_IM_MODULE_DIR/immodules.cache
if [ "$SNAP_DESKTOP_COMPONENTS_NEED_UPDATE" = "true" ]; then
  rm -rf "$GTK_IM_MODULE_DIR"
  mkdir -p "$GTK_IM_MODULE_DIR"
  if [ -x "$SNAP_DESKTOP_RUNTIME/usr/lib/$SNAP_DESKTOP_ARCH_TRIPLET/libgtk-3-0/gtk-query-immodules-3.0" ]; then
    ln -sf "$SNAP_DESKTOP_RUNTIME/usr/lib/$SNAP_DESKTOP_ARCH_TRIPLET/gtk-3.0/3.0.0/immodules"/*.so "$GTK_IM_MODULE_DIR"
    "$SNAP_DESKTOP_RUNTIME/usr/lib/$SNAP_DESKTOP_ARCH_TRIPLET/libgtk-3-0/gtk-query-immodules-3.0" > "$GTK_IM_MODULE_FILE"
  elif [ -x "$SNAP_DESKTOP_RUNTIME/usr/lib/$SNAP_DESKTOP_ARCH_TRIPLET/libgtk2.0-0/gtk-query-immodules-2.0" ]; then
    ln -sf "$SNAP_DESKTOP_RUNTIME/usr/lib/$SNAP_DESKTOP_ARCH_TRIPLET/gtk-2.0/2.10.0/immodules"/*.so "$GTK_IM_MODULE_DIR"
    "$SNAP_DESKTOP_RUNTIME/usr/lib/$SNAP_DESKTOP_ARCH_TRIPLET/libgtk2.0-0/gtk-query-immodules-2.0" > "$GTK_IM_MODULE_FILE"
  fi
fi

exec "$@"