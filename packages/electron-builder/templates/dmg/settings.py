# -*- coding: utf-8 -*-
from __future__ import unicode_literals

import biplist
import os.path

application = <%= people.join(", "); %>
appname = os.path.basename(application)

def icon_from_app(app_path):
    plist_path = os.path.join(app_path, 'Contents', 'Info.plist')
    plist = biplist.readPlist(plist_path)
    icon_name = plist['CFBundleIconFile']
    icon_root,icon_ext = os.path.splitext(icon_name)
    if not icon_ext:
        icon_ext = '.icns'
    icon_name = icon_root + icon_ext
    return os.path.join(app_path, 'Contents', 'Resources', icon_name)

# .. Basics ....................................................................

# Volume format (see hdiutil create -help)
format = defines.get('format')

# Compression level (if relevant)
compression_level = defines.get('compressionLevel', 9)

# Volume size
size = defines.get('size', None)

# Files to include
files = [ application ]

# Symlinks to create
symlinks = { 'Applications': '/Applications' }

# Volume icon
#
# You can either define icon, in which case that icon file will be copied to the
# image, *or* you can define badge_icon, in which case the icon file you specify
# will be used to badge the system's Removable Disk icon
#
#icon = '/path/to/icon.icns'
badge_icon = icon_from_app(application)

# Where to put the icons
icon_locations = {
    appname:        (140, 120),
    'Applications': (500, 120)
    }

# .. Window configuration ......................................................

# Background
#
# This is a STRING containing any of the following:
#
#    #3344ff          - web-style RGB color
#    #34f             - web-style RGB color, short form (#34f == #3344ff)
#    rgb(1,0,0)       - RGB color, each value is between 0 and 1
#    hsl(120,1,.5)    - HSL (hue saturation lightness) color
#    hwb(300,0,0)     - HWB (hue whiteness blackness) color
#    cmyk(0,1,0,0)    - CMYK color
#    goldenrod        - X11/SVG named color
#    builtin-arrow    - A simple built-in background with a blue arrow
#    /foo/bar/baz.png - The path to an image file
#
# The hue component in hsl() and hwb() may include a unit; it defaults to
# degrees ('deg'), but also supports radians ('rad') and gradians ('grad'
# or 'gon').
#
# Other color components may be expressed either in the range 0 to 1, or
# as percentages (e.g. 60% is equivalent to 0.6).
background = 'builtin-arrow'

show_status_bar = False
show_tab_view = False
show_toolbar = False
show_pathbar = False
show_sidebar = False
sidebar_width = 180

# Window position in ((x, y), (w, h)) format
window_rect = ((100, 100), (640, 280))

# Select the default view; must be one of
#
#    'icon-view'
#    'list-view'
#    'column-view'
#    'coverflow'
#
default_view = 'icon-view'

# General view configuration
show_icon_preview = False

# Set these to True to force inclusion of icon/list view settings (otherwise
# we only include settings for the default view)
include_icon_view_settings = 'auto'
include_list_view_settings = 'auto'

# .. Icon view configuration ...................................................

arrange_by = None
grid_offset = (0, 0)
grid_spacing = 100
scroll_position = (0, 0)
label_pos = 'bottom' # or 'right'
text_size = 16
icon_size = 128

# .. List view configuration ...................................................

# Column names are as follows:
#
#   name
#   date-modified
#   date-created
#   date-added
#   date-last-opened
#   size
#   kind
#   label
#   version
#   comments
#
list_icon_size = 16
list_text_size = 12
list_scroll_position = (0, 0)
list_sort_by = 'name'
list_use_relative_dates = True
list_calculate_all_sizes = False,
list_columns = ('name', 'date-modified', 'size', 'kind', 'date-added')
list_column_widths = {
    'name': 300,
    'date-modified': 181,
    'date-created': 181,
    'date-added': 181,
    'date-last-opened': 181,
    'size': 97,
    'kind': 115,
    'label': 100,
    'version': 75,
    'comments': 300,
    }
list_column_sort_directions = {
    'name': 'ascending',
    'date-modified': 'descending',
    'date-created': 'descending',
    'date-added': 'descending',
    'date-last-opened': 'descending',
    'size': 'descending',
    'kind': 'ascending',
    'label': 'ascending',
    'version': 'ascending',
    'comments': 'ascending',
    }

# .. License configuration .....................................................

# Text in the license configuration is stored in the resources, which means
# it gets stored in a legacy Mac encoding according to the language.  dmgbuild
# will *try* to convert Unicode strings to the appropriate encoding, *but*
# you should be aware that Python doesn't support all of the necessary encodings;
# in many cases you will need to encode the text yourself and use byte strings
# instead here.

# Recognized language names are:
#
#  af_ZA, ar, be_BY, bg_BG, bn, bo, br, ca_ES, cs_CZ, cy, da_DK, de_AT, de_CH,
#  de_DE, dz_BT, el_CY, el_GR, en_AU, en_CA, en_GB, en_IE, en_SG, en_US, eo,
#  es_419, es_ES, et_EE, fa_IR, fi_FI, fo_FO, fr_001, fr_BE, fr_CA, fr_CH,
#  fr_FR, ga-Latg_IE, ga_IE, gd, grc, gu_IN, gv, he_IL, hi_IN, hr_HR, hu_HU,
#  hy_AM, is_IS, it_CH, it_IT, iu_CA, ja_JP, ka_GE, kl, ko_KR, lt_LT, lv_LV,
#  mk_MK, mr_IN, mt_MT, nb_NO, ne_NP, nl_BE, nl_NL, nn_NO, pa, pl_PL, pt_BR,
#  pt_PT, ro_RO, ru_RU, se, sk_SK, sl_SI, sr_RS, sv_SE, th_TH, to_TO, tr_TR,
#  uk_UA, ur_IN, ur_PK, uz_UZ, vi_VN, zh_CN, zh_TW

# license = {
#     'default-language': 'en_US',
#     'licenses': {
#         # For each language, the text of the license.  This can be plain text,
#         # RTF (in which case it must start "{\rtf1"), or a path to a file
#         # containing the license text.  If you're using RTF,
#         # watch out for Python escaping (or read it from a file).
#         'English': b'''{\\rtf1\\ansi\\ansicpg1252\\cocoartf1504\\cocoasubrtf820
# {\\fonttbl\\f0\\fnil\\fcharset0 Helvetica-Bold;\\f1\\fnil\\fcharset0 Helvetica;}
# {\\colortbl;\\red255\\green255\\blue255;\\red0\\green0\\blue0;}
# {\\*\\expandedcolortbl;;\\cssrgb\\c0\\c0\\c0;}
# \\paperw11905\\paperh16837\\margl1133\\margr1133\\margb1133\\margt1133
# \\deftab720
# \\pard\\pardeftab720\\sa160\\partightenfactor0

# \\f0\\b\\fs60 \\cf2 \\expnd0\\expndtw0\\kerning0
# \\up0 \\nosupersub \\ulnone \\outl0\\strokewidth0 \\strokec2 Test License\\
# \\pard\\pardeftab720\\sa160\\partightenfactor0

# \\fs36 \\cf2 \\strokec2 What is this?\\
# \\pard\\pardeftab720\\sa160\\partightenfactor0

# \\f1\\b0\\fs22 \\cf2 \\strokec2 This is the English license. It says what you are allowed to do with this software.\\
# \\
# }''',
#     },
#     'buttons': {
#         # For each language, text for the buttons on the licensing window.
#         #
#         # Default buttons and text are built-in for the following languages:
#         #
#         #   English (en_US), German (de_DE), Spanish (es_ES), French (fr_FR),
#         #   Italian (it_IT), Japanese (ja_JP), Dutch (nl_NL), Swedish (sv_SE),
#         #   Brazilian Portuguese (pt_BR), Simplified Chinese (zh_CN),
#         #   Traditional Chinese (zh_TW), Danish (da_DK), Finnish (fi_FI),
#         #   Korean (ko_KR), Norwegian (nb_NO)
#         #
#         # You don't need to specify them for those languages; if you fail to
#         # specify them for some other language, English will be used instead.

#         'en_US': (
#             b'English',
#             b'Agree',
#             b'Disagree',
#             b'Print',
#             b'Save',
#             b'If you agree with the terms of this license, press "Agree" to '
#             b'install the software.  If you do not agree, press "Disagree".'
#         ),
#     },
# }
