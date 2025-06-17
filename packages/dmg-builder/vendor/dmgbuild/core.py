import json
import os
import platform
import plistlib
import re
import shutil
import subprocess
import tempfile
import time
import tokenize

try:
    import importlib_resources as resources
except ImportError:
    from importlib import resources

from ds_store import DSStore
from mac_alias import Alias, Bookmark

from . import colors, licensing

try:
    from . import badge
except ImportError:
    badge = None


_hexcolor_re = re.compile(r"#[0-9a-f]{3}(?:[0-9a-f]{3})?")

# The first element in the platform.mac_ver() tuple is a string containing the
# macOS version (e.g., '10.15.6'). Parse into an integer tuple.
MACOS_VERSION = tuple(int(v) for v in platform.mac_ver()[0].split("."))


class DMGError(Exception):
    def __init__(self, callback, message):
        self.message = message
        callback({"type": "error::fatal", "message": message})

    def __str__(self):
        return str(self.message)


def quiet_callback(info):
    pass


def hdiutil(cmd, *args, **kwargs):
    plist = kwargs.get("plist", True)
    all_args = ["/usr/bin/hdiutil", cmd]
    all_args.extend(args)
    if plist:
        all_args.append("-plist")
    p = subprocess.Popen(
        all_args,
        stdout=subprocess.PIPE,
        stderr=None if plist else subprocess.STDOUT,
        close_fds=True,
    )
    output, _ = p.communicate()
    if plist:
        results = plistlib.loads(output)
    else:
        results = output.decode()
    retcode = p.wait()
    return retcode, results


def load_settings(filename, settings):
    encoding = "utf-8"
    with open(filename, "rb") as fp:
        try:
            encoding = tokenize.detect_encoding(fp.readline)[0]
        except SyntaxError:
            pass

    with open(filename, encoding=encoding) as fp:
        exec(compile(fp.read(), filename, "exec"), settings, settings)


def load_json(filename, settings):
    """Read an appdmg .json spec.

    Uses the defaults for appdmg, rather than the usual defaults for
    dmgbuild.
    """

    with open(filename) as fp:
        json_data = json.load(fp)

    if "title" not in json_data:
        raise ValueError("missing 'title' in JSON settings file")
    if "contents" not in json_data:
        raise ValueError("missing 'contents' in JSON settings file")

    settings["volume_name"] = json_data["title"]
    settings["icon"] = json_data.get("icon", None)
    settings["badge_icon"] = json_data.get("badge-icon", None)
    bk = json_data.get("background", None)
    if bk is None:
        bk = json_data.get("background-color", None)
    if bk is not None:
        settings["background"] = bk
    settings["icon_size"] = json_data.get("icon-size", 80)
    tsize = json_data.get("text-size", None)
    if tsize is not None:
        settings["text_size"] = tsize
    wnd = json_data.get(
        "window",
        {
            "position": {"x": 100, "y": 100},
            "size": {"width": 640, "height": 480},
        },
    )
    pos = wnd.get("position", {"x": 100, "y": 100})
    siz = wnd.get("size", {"width": 640, "height": 480})
    settings["window_rect"] = (
        (pos.get("x", 100), pos.get("y", 100)),
        (siz.get("width", 640), siz.get("height", 480)),
    )
    settings["format"] = json_data.get("format", "UDZO")
    settings["filesystem"] = json_data.get("filesystem", "HFS+")
    settings["compression_level"] = json_data.get("compression-level", None)
    settings["license"] = json_data.get("license", None)
    files = []
    hide = []
    hide_extensions = []
    symlinks = {}
    icon_locations = {}
    for fileinfo in json_data.get("contents", []):
        if "path" not in fileinfo:
            raise ValueError("missing 'path' in contents in JSON settings file")
        if "x" not in fileinfo:
            raise ValueError("missing 'x' in contents in JSON settings file")
        if "y" not in fileinfo:
            raise ValueError("missing 'y' in contents in JSON settings file")

        kind = fileinfo.get("type", "file")
        path = fileinfo["path"]
        name = fileinfo.get("name", os.path.basename(path.rstrip("/")))
        if kind == "file":
            files.append((path, name))
        elif kind == "link":
            symlinks[name] = path
        elif kind == "position":
            pass
        icon_locations[name] = (fileinfo["x"], fileinfo["y"])
        hide_ext = fileinfo.get("hide_extension", False)
        if hide_ext:
            hide_extensions.append(name)
        hidden = fileinfo.get("hidden", False)
        if hidden:
            hide.append(name)

    settings["files"] = files
    settings["hide_extensions"] = hide_extensions
    settings["hide"] = hide
    settings["symlinks"] = symlinks
    settings["icon_locations"] = icon_locations


def build_dmg(  # noqa; C901
    filename,
    volume_name,
    settings_file=None,
    settings={},
    defines={},
    lookForHiDPI=True,
    detach_retries=12,
    callback=quiet_callback,
):
    options = {
        # Default settings
        "filename": filename,
        "volume_name": volume_name,
        "format": "UDBZ",
        "filesystem": "HFS+",
        "compression_level": None,
        "size": None,
        "files": [],
        "symlinks": {},
        "hide": [],
        "hide_extensions": [],
        "icon": None,
        "badge_icon": None,
        "background": None,
        "show_status_bar": False,
        "show_tab_view": False,
        "show_toolbar": False,
        "show_pathbar": False,
        "show_sidebar": False,
        "sidebar_width": 180,
        "arrange_by": None,
        "grid_offset": (0, 0),
        "grid_spacing": 100.0,
        "scroll_position": (0.0, 0.0),
        "show_icon_preview": False,
        "show_item_info": False,
        "label_pos": "bottom",
        "text_size": 16.0,
        "icon_size": 128.0,
        "include_icon_view_settings": "auto",
        "include_list_view_settings": "auto",
        "list_icon_size": 16.0,
        "list_text_size": 12.0,
        "list_scroll_position": (0, 0),
        "list_sort_by": "name",
        "list_use_relative_dates": True,
        "list_calculate_all_sizes": False,
        "list_columns": ("name", "date-modified", "size", "kind", "date-added"),
        "list_column_widths": {
            "name": 300,
            "date-modified": 181,
            "date-created": 181,
            "date-added": 181,
            "date-last-opened": 181,
            "size": 97,
            "kind": 115,
            "label": 100,
            "version": 75,
            "comments": 300,
        },
        "list_column_sort_directions": {
            "name": "ascending",
            "date-modified": "descending",
            "date-created": "descending",
            "date-added": "descending",
            "date-last-opened": "descending",
            "size": "descending",
            "kind": "ascending",
            "label": "ascending",
            "version": "ascending",
            "comments": "ascending",
        },
        "window_rect": ((100, 100), (640, 280)),
        "default_view": "icon-view",
        "icon_locations": {},
        "license": None,
        "defines": defines,
    }

    callback({"type": "build::started"})

    # Execute the settings file
    if settings_file:
        callback(
            {
                "type": "operation::start",
                "operation": "settings::load",
            }
        )

        # We now support JSON settings files using appdmg's format
        if settings_file.endswith(".json"):
            load_json(settings_file, options)
        else:
            load_settings(settings_file, options)

        callback(
            {
                "type": "operation::finished",
                "operation": "settings::load",
            }
        )

    # Add any overrides
    options.update(settings)

    # Set up the finder data
    bounds = options["window_rect"]

    bounds_string = "{{{{{}, {}}}, {{{}, {}}}}}".format(
        bounds[0][0], bounds[0][1], bounds[1][0], bounds[1][1]
    )
    bwsp = {
        "ShowStatusBar": options["show_status_bar"],
        "WindowBounds": bounds_string,
        "ContainerShowSidebar": False,
        "PreviewPaneVisibility": False,
        "SidebarWidth": options["sidebar_width"],
        "ShowTabView": options["show_tab_view"],
        "ShowToolbar": options["show_toolbar"],
        "ShowPathbar": options["show_pathbar"],
        "ShowSidebar": options["show_sidebar"],
    }

    arrange_options = {
        "name": "name",
        "date-modified": "dateModified",
        "date-created": "dateCreated",
        "date-added": "dateAdded",
        "date-last-opened": "dateLastOpened",
        "size": "size",
        "kind": "kind",
        "label": "label",
    }

    icvp = {
        "viewOptionsVersion": 1,
        "backgroundType": 0,
        "backgroundColorRed": 1.0,
        "backgroundColorGreen": 1.0,
        "backgroundColorBlue": 1.0,
        "gridOffsetX": float(options["grid_offset"][0]),
        "gridOffsetY": float(options["grid_offset"][1]),
        "gridSpacing": float(options["grid_spacing"]),
        "arrangeBy": str(arrange_options.get(options["arrange_by"], "none")),
        "showIconPreview": bool(options["show_icon_preview"]),
        "showItemInfo": bool(options["show_item_info"]),
        "labelOnBottom": options["label_pos"] == "bottom",
        "textSize": float(options["text_size"]),
        "iconSize": float(options["icon_size"]),
        "scrollPositionX": float(options["scroll_position"][0]),
        "scrollPositionY": float(options["scroll_position"][1]),
    }

    background = options["background"]

    columns = {
        "name": "name",
        "date-modified": "dateModified",
        "date-created": "dateCreated",
        "date-added": "dateAdded",
        "date-last-opened": "dateLastOpened",
        "size": "size",
        "kind": "kind",
        "label": "label",
        "version": "version",
        "comments": "comments",
    }

    default_widths = {
        "name": 300,
        "date-modified": 181,
        "date-created": 181,
        "date-added": 181,
        "date-last-opened": 181,
        "size": 97,
        "kind": 115,
        "label": 100,
        "version": 75,
        "comments": 300,
    }

    default_sort_directions = {
        "name": "ascending",
        "date-modified": "descending",
        "date-created": "descending",
        "date-added": "descending",
        "date-last-opened": "descending",
        "size": "descending",
        "kind": "ascending",
        "label": "ascending",
        "version": "ascending",
        "comments": "ascending",
    }

    lsvp = {
        "viewOptionsVersion": 1,
        "sortColumn": columns.get(options["list_sort_by"], "name"),
        "textSize": float(options["list_text_size"]),
        "iconSize": float(options["list_icon_size"]),
        "showIconPreview": options["show_icon_preview"],
        "scrollPositionX": options["list_scroll_position"][0],
        "scrollPositionY": options["list_scroll_position"][1],
        "useRelativeDates": options["list_use_relative_dates"],
        "calculateAllSizes": options["list_calculate_all_sizes"],
    }

    lsvp["columns"] = {}
    cndx = {}

    for n, column in enumerate(options["list_columns"]):
        cndx[column] = n
        width = options["list_column_widths"].get(column, default_widths[column])
        asc = "ascending" == options["list_column_sort_directions"].get(
            column, default_sort_directions[column]
        )

        lsvp["columns"][columns[column]] = {
            "index": n,
            "width": width,
            "identifier": columns[column],
            "visible": True,
            "ascending": asc,
        }

    n = len(options["list_columns"])
    for k in columns:
        if cndx.get(k, None) is None:
            cndx[k] = n
            width = default_widths[k]
            asc = "ascending" == default_sort_directions[k]

        lsvp["columns"][columns[column]] = {
            "index": n,
            "width": width,
            "identifier": columns[column],
            "visible": False,
            "ascending": asc,
        }

        n += 1

    default_view = options["default_view"]
    views = {
        "icon-view": b"icnv",
        "column-view": b"clmv",
        "list-view": b"Nlsv",
        "coverflow": b"Flwv",
    }

    icvl = (b"type", views.get(default_view, "icnv"))

    include_icon_view_settings = default_view == "icon-view" or options[
        "include_icon_view_settings"
    ] not in ("auto", "no", 0, False, None)
    include_list_view_settings = default_view in ("list-view", "coverflow") or options[
        "include_list_view_settings"
    ] not in ("auto", "no", 0, False, None)

    filename = options["filename"]
    volume_name = options["volume_name"]

    # Construct a writeable image to start with
    dirname, basename = os.path.split(os.path.realpath(filename))
    if not basename.endswith(".dmg"):
        basename += ".dmg"
    writableFile = tempfile.NamedTemporaryFile(
        dir=dirname, prefix=".temp", suffix=basename
    )

    callback(
        {
            "type": "operation::start",
            "operation": "size::calculate",
        }
    )

    total_size = options["size"]
    if total_size is None:
        # Start with a size of 128MB - this way we don't need to calculate the
        # size of the background image, volume icon, and .DS_Store file (and
        # 128 MB should be well sufficient for even the most outlandish image
        # sizes, like an uncompressed 5K multi-resolution TIFF)
        total_size = 128 * 1024 * 1024

        def roundup(x, n):
            return x if x % n == 0 else x + n - x % n

        for path in options["files"]:
            if isinstance(path, tuple):
                path = path[0]

            if not os.path.islink(path) and os.path.isdir(path):
                for dirpath, dirnames, filenames in os.walk(path):
                    for f in filenames:
                        fp = os.path.join(dirpath, f)
                        total_size += roundup(os.lstat(fp).st_size, 4096)
            else:
                total_size += roundup(os.lstat(path).st_size, 4096)

        for name, target in options["symlinks"].items():
            total_size += 4096

        total_size = str(max(total_size / 1000, 1024)) + "K"

    callback(
        {
            "type": "operation::finished",
            "operation": "size::calculate",
            "size": total_size,
        }
    )

    callback(
        {
            "type": "command::start",
            "command": "hdiutil::create",
        }
    )

    filesystem = options["filesystem"].upper()
    fs_args = "-c c=64,a=16,e=16" if filesystem != "APFS" else ""

    ret, output = hdiutil(
        "create",
        "-ov",
        "-volname",
        volume_name,
        "-fs",
        filesystem,
        "-fsargs",
        fs_args,
        "-size",
        total_size,
        writableFile.name,
    )

    callback(
        {
            "type": "command::finished",
            "command": "hdiutil::create",
            "ret": ret,
            "output": output,
        }
    )

    if ret:
        raise DMGError(callback, f"Unable to create disk image: {output}")

    callback(
        {
            "type": "command::start",
            "command": "hdiutil::attach",
        }
    )

    # IDME was deprecated in macOS 10.15/Catalina; as a result, use of -noidme
    # started raising a warning.
    if MACOS_VERSION >= (10, 15):
        ret, output = hdiutil(
            "attach", "-nobrowse", "-owners", "off", writableFile.name
        )
    else:
        ret, output = hdiutil(
            "attach", "-nobrowse", "-owners", "off", "-noidme", writableFile.name
        )

    callback(
        {
            "type": "command::finished",
            "command": "hdiutil::attach",
            "ret": ret,
            "output": output,
        }
    )

    if ret:
        raise DMGError(callback, f"Unable to attach disk image: {output}")

    callback(
        {
            "type": "operation::start",
            "operation": "dmg::create",
        }
    )

    try:
        for info in output["system-entities"]:
            if info.get("mount-point", None):
                device = info["dev-entry"]
                mount_point = info["mount-point"]

        icon = options["icon"]
        if badge:
            badge_icon = options["badge_icon"]
        else:
            badge_icon = None
        icon_target_path = os.path.join(mount_point, ".VolumeIcon.icns")
        if icon:
            shutil.copyfile(icon, icon_target_path)
        elif badge_icon:
            badge.badge_disk_icon(badge_icon, icon_target_path)

        if icon or badge_icon:
            subprocess.call(["/usr/bin/SetFile", "-a", "C", mount_point])

        background_bmk = None

        callback(
            {
                "type": "operation::start",
                "operation": "background::create",
            }
        )

        if not isinstance(background, str):
            pass
        elif colors.isAColor(background):
            c = colors.parseColor(background).to_rgb()

            icvp["backgroundType"] = 1
            icvp["backgroundColorRed"] = float(c.r)
            icvp["backgroundColorGreen"] = float(c.g)
            icvp["backgroundColorBlue"] = float(c.b)
        else:
            if os.path.isfile(background):
                # look to see if there are HiDPI resources available

                if lookForHiDPI is True:
                    name, extension = os.path.splitext(os.path.basename(background))
                    orderedImages = [background]
                    imageDirectory = os.path.dirname(background)
                    if imageDirectory == "":
                        imageDirectory = "."
                    for candidateName in os.listdir(imageDirectory):
                        hasScale = re.match(
                            r"^(?P<name>.+)@(?P<scale>\d+)x(?P<extension>\.\w+)$",
                            candidateName,
                        )
                        if (
                            hasScale
                            and name == hasScale.group("name")
                            and extension == hasScale.group("extension")
                        ):
                            scale = int(hasScale.group("scale"))
                            if len(orderedImages) < scale:
                                orderedImages += [None] * (scale - len(orderedImages))
                            orderedImages[scale - 1] = os.path.join(
                                imageDirectory, candidateName
                            )

                    if len(orderedImages) > 1:
                        # compile the grouped tiff
                        backgroundFile = tempfile.NamedTemporaryFile(suffix=".tiff")
                        background = backgroundFile.name
                        output = tempfile.TemporaryFile(mode="w+")
                        try:
                            subprocess.check_call(
                                ["/usr/bin/tiffutil", "-cathidpicheck"]
                                + list(filter(None, orderedImages))
                                + ["-out", background],
                                stdout=output,
                                stderr=output,
                            )
                        except Exception as e:
                            output.seek(0)
                            raise ValueError(
                                'unable to compile combined HiDPI file "%s" got error: %s\noutput: %s'
                                % (background, str(e), output.read())
                            )

                _, kind = os.path.splitext(background)
                path_in_image = os.path.join(mount_point, ".background" + kind)
                shutil.copyfile(background, path_in_image)
            else:
                dmg_resources = resources.files("dmgbuild")
                bg_resource = dmg_resources.joinpath(
                    "resources/" + background + ".tiff"
                )
                if bg_resource.is_file():
                    path_in_image = os.path.join(mount_point, ".background.tiff")
                    with bg_resource.open("rb") as in_file:
                        with open(path_in_image, "wb") as out_file:
                            out_file.write(in_file.read())
                else:
                    raise ValueError('background file "%s" not found' % background)

            alias = Alias.for_file(path_in_image)
            background_bmk = Bookmark.for_file(path_in_image)

            icvp["backgroundType"] = 2
            icvp["backgroundImageAlias"] = alias.to_bytes()

        callback(
            {
                "type": "operation::finished",
                "operation": "background::create",
            }
        )

        callback(
            {
                "type": "operation::start",
                "operation": "files::add",
                "total": len(options["files"]),
            }
        )

        for f in options["files"]:
            if isinstance(f, tuple):
                f_in_image = os.path.join(mount_point, f[1])
                f = f[0]
            else:
                basename = os.path.basename(f.rstrip("/"))
                f_in_image = os.path.join(mount_point, basename)

            callback(
                {
                    "type": "operation::start",
                    "operation": "file::add",
                    "file": f_in_image,
                }
            )

            # use system ditto command to preserve code signing, etc.
            subprocess.call(["/usr/bin/ditto", f, f_in_image])

            callback(
                {
                    "type": "operation::finished",
                    "operation": "file::add",
                    "file": f_in_image,
                }
            )

        callback(
            {
                "type": "operation::finished",
                "operation": "files::add",
            }
        )

        callback(
            {
                "type": "operation::start",
                "operation": "symlinks::add",
                "total": len(options["symlinks"]),
            }
        )

        for name, target in options["symlinks"].items():
            name_in_image = os.path.join(mount_point, name)
            callback(
                {
                    "type": "operation::start",
                    "operation": "symlink::add",
                    "file": name_in_image,
                    "target": target,
                }
            )
            os.symlink(target, name_in_image)
            callback(
                {
                    "type": "operation::finished",
                    "operation": "symlink::add",
                    "file": name_in_image,
                    "target": target,
                }
            )

        callback(
            {
                "type": "operation::finished",
                "operation": "symlinks::add",
            }
        )

        callback(
            {
                "type": "operation::start",
                "operation": "extensions::hide",
            }
        )

        to_hide = []
        for name in options["hide_extensions"]:
            name_in_image = os.path.join(mount_point, name)
            to_hide.append(name_in_image)

        if to_hide:
            subprocess.call(["/usr/bin/SetFile", "-a", "E"] + to_hide)

        to_hide = []
        for name in options["hide"]:
            name_in_image = os.path.join(mount_point, name)
            to_hide.append(name_in_image)

        if to_hide:
            subprocess.call(["/usr/bin/SetFile", "-a", "V"] + to_hide)

        callback(
            {
                "type": "operation::finished",
                "operation": "extensions::hide",
            }
        )

        userfn = options.get("create_hook", None)
        if callable(userfn):
            userfn(mount_point, options)

        callback(
            {
                "type": "operation::start",
                "operation": "dsstore::create",
            }
        )

        image_dsstore = os.path.join(mount_point, ".DS_Store")

        with DSStore.open(image_dsstore, "w+") as d:
            d["."]["vSrn"] = ("long", 1)
            d["."]["bwsp"] = bwsp
            if include_icon_view_settings:
                d["."]["icvp"] = icvp
                if background_bmk:
                    d["."]["pBBk"] = background_bmk
            if include_list_view_settings:
                d["."]["lsvp"] = lsvp
            d["."]["icvl"] = icvl

            for k, v in options["icon_locations"].items():
                d[k]["Iloc"] = v

        callback(
            {
                "type": "operation::finished",
                "operation": "dsstore::create",
            }
        )

        # Delete .Trashes, if it gets created
        shutil.rmtree(os.path.join(mount_point, ".Trashes"), True)
    except Exception:
        # Always try to detach
        hdiutil("detach", "-force", device, plist=False)
        raise

    callback(
        {
            "type": "operation::finished",
            "operation": "dmg::create",
        }
    )

    # Flush writes before attempting to detach.
    subprocess.check_call(("sync", "--file-system", mount_point))

    retry_time = 1
    for tries in range(detach_retries):
        callback(
            {
                "type": "command::start",
                "command": "hdiutil::detach",
            }
        )

        ret, output = hdiutil("detach", device, plist=False)

        callback(
            {
                "type": "command::finished",
                "command": "hdiutil::detach",
                "ret:": ret,
                "output:": output,
            }
        )

        if not ret:
            break

        # Exponentially backoff retries
        retry_time *= 1.5
        time.sleep(retry_time)

    if ret:
        hdiutil("detach", "-force", device, plist=False)
        raise DMGError(callback, f"Unable to detach device cleanly: {output}")

    callback(
        {
            "type": "command::start",
            "command": "hdiutil::resize",
        }
    )

    # Shrink the output to the minimum possible size
    ret, output = hdiutil(
        "resize", "-quiet", "-sectors", "min", writableFile.name, plist=False
    )

    callback(
        {
            "type": "command::finished",
            "command": "hdiutil::resize",
            "ret": ret,
            "output": output,
        }
    )

    if ret:
        raise DMGError(callback, f"Unable to shrink: {output}")

    callback(
        {
            "type": "operation::start",
            "operation": "dmg::shrink",
        }
    )

    key_prefix = {"UDZO": "zlib", "UDBZ": "bzip2", "ULFO": "lzfse", "ULMO": "lzma"}
    compression_level = options["compression_level"]
    if options["format"] in key_prefix and compression_level:
        compression_args = [
            "-imagekey",
            key_prefix[options["format"]] + "-level=" + str(compression_level),
        ]
    else:
        compression_args = []

    callback(
        {
            "type": "command::start",
            "command": "hdiutil::convert",
        }
    )

    ret, output = hdiutil(
        "convert",
        writableFile.name,
        "-format",
        options["format"],
        "-ov",
        "-o",
        filename,
        *compression_args,
    )

    callback(
        {
            "type": "command::finished",
            "command": "hdiutil::convert",
            "ret": ret,
            "output": output,
        }
    )

    if ret:
        raise DMGError(callback, f"Unable to convert: {output}")

    callback(
        {
            "type": "operation::finished",
            "operation": "dmg::shrink",
        }
    )

    if options["license"]:
        callback(
            {
                "type": "operation::start",
                "command": "dmg::addlicense",
            }
        )

        licenseDict = licensing.build_license(options["license"])

        tempLicenseFile = open(os.path.join(dirname, "license.plist"), "wb")
        plistlib.dump(licenseDict, tempLicenseFile)
        tempLicenseFile.close()

        # see https://developer.apple.com/forums/thread/668084
        ret, output = hdiutil(
            "udifrez", "-xml", tempLicenseFile.name, "", "-quiet", filename, plist=False
        )

        os.remove(tempLicenseFile.name)

        if ret:
            raise DMGError(callback, f"Unable to add license: {output}")

        callback(
            {
                "type": "operation::finished",
                "command": "dmg::addlicense",
            }
        )

    callback({"type": "build::finished"})
