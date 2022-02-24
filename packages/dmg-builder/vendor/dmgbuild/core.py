# -*- coding: utf-8 -*-
from __future__ import unicode_literals

import os
import re
import sys

if sys.version_info.major == 3:
  try:
      from importlib import reload
  except ImportError:
      from imp import reload
  reload(sys)  # To workaround the unbound issue
else:
  reload(sys)  # Reload is a hack
  sys.setdefaultencoding('UTF8')

sys.path.append(os.path.normpath(os.path.join(os.path.dirname(__file__), "..")))

try:
  {}.iteritems
  iteritems = lambda x: x.iteritems()
  iterkeys = lambda x: x.iterkeys()
except AttributeError:
  iteritems = lambda x: x.items()
  iterkeys = lambda x: x.keys()
try:
  unicode
except NameError:
  unicode = str

import biplist
from mac_alias import *
from ds_store import *

from colors import parseColor

try:
  from badge import badge
except ImportError:
  badge = None

class DMGError(Exception):
  pass


def build_dmg():
  options = {
    'icon': None,
    'badge_icon': None,
    'sidebar_width': 180,
    'arrange_by': None,
    'grid_offset': (0, 0),
    'grid_spacing': 100.0,
    'scroll_position': (0.0, 0.0),
    'show_icon_preview': False,
    'text_size': os.environ['iconTextSize'],
    'icon_size': os.environ['iconSize'],
    'include_icon_view_settings': 'auto',
    'include_list_view_settings': 'auto',
    'list_icon_size': 16.0,
    'list_text_size': 12.0,
    'list_scroll_position': (0, 0),
    'list_sort_by': 'name',
    'list_columns': ('name', 'date-modified', 'size', 'kind', 'date-added'),
    'list_column_widths': {
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
    },
    'list_column_sort_directions': {
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
  }

  # Set up the finder data
  bwsp = {
    'ShowStatusBar': False,
    'ContainerShowSidebar': False,
    'PreviewPaneVisibility': False,
    'SidebarWidth': options['sidebar_width'],
    'ShowTabView': False,
    'ShowToolbar': False,
    'ShowPathbar': False,
    'ShowSidebar': False
  }

  window_x = os.environ.get('windowX')
  if window_x:
    window_y = os.environ['windowY']
    bwsp['WindowBounds'] = '{{%s, %s}, {%s, %s}}' % (window_x,
                                                     window_y,
                                                     os.environ['windowWidth'],
                                                     os.environ['windowHeight'])

  arrange_options = {
    'name': 'name',
    'date-modified': 'dateModified',
    'date-created': 'dateCreated',
    'date-added': 'dateAdded',
    'date-last-opened': 'dateLastOpened',
    'size': 'size',
    'kind': 'kind',
    'label': 'label',
  }

  icvp = {
    'viewOptionsVersion': 1,
    'backgroundType': 0,
    'backgroundColorRed': 1.0,
    'backgroundColorGreen': 1.0,
    'backgroundColorBlue': 1.0,
    'gridOffsetX': float(options['grid_offset'][0]),
    'gridOffsetY': float(options['grid_offset'][1]),
    'gridSpacing': float(options['grid_spacing']),
    'arrangeBy': str(arrange_options.get(options['arrange_by'], 'none')),
    'showIconPreview': options['show_icon_preview'] == True,
    'showItemInfo': False,
    'labelOnBottom': True,
    'textSize': float(options['text_size']),
    'iconSize': float(options['icon_size']),
    'scrollPositionX': float(options['scroll_position'][0]),
    'scrollPositionY': float(options['scroll_position'][1])
  }

  columns = {
    'name': 'name',
    'date-modified': 'dateModified',
    'date-created': 'dateCreated',
    'date-added': 'dateAdded',
    'date-last-opened': 'dateLastOpened',
    'size': 'size',
    'kind': 'kind',
    'label': 'label',
    'version': 'version',
    'comments': 'comments'
  }

  default_widths = {
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

  default_sort_directions = {
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

  lsvp = {
    'viewOptionsVersion': 1,
    'sortColumn': columns.get(options['list_sort_by'], 'name'),
    'textSize': float(options['list_text_size']),
    'iconSize': float(options['list_icon_size']),
    'showIconPreview': options['show_icon_preview'],
    'scrollPositionX': options['list_scroll_position'][0],
    'scrollPositionY': options['list_scroll_position'][1],
    'useRelativeDates': True,
    'calculateAllSizes': False,
  }

  lsvp['columns'] = {}
  cndx = {}

  for n, column in enumerate(options['list_columns']):
    cndx[column] = n
    width = options['list_column_widths'].get(column, default_widths[column])
    asc = 'ascending' == options['list_column_sort_directions'].get(column, default_sort_directions[column])

    lsvp['columns'][columns[column]] = {
      'index': n,
      'width': width,
      'identifier': columns[column],
      'visible': True,
      'ascending': asc
    }

  n = len(options['list_columns'])
  for k in iterkeys(columns):
    if cndx.get(k, None) is None:
      cndx[k] = n
      width = default_widths[k]
      asc = 'ascending' == default_sort_directions[k]

    lsvp['columns'][columns[column]] = {
      'index': n,
      'width': width,
      'identifier': columns[column],
      'visible': False,
      'ascending': asc
    }

    n += 1

  default_view = 'icon-view'
  views = {
    'icon-view': b'icnv',
    'column-view': b'clmv',
    'list-view': b'Nlsv',
    'coverflow': b'Flwv'
  }

  icvl = (b'type', views.get(default_view, 'icnv'))

  include_icon_view_settings = default_view == 'icon-view' \
                               or options['include_icon_view_settings'] not in \
                               ('auto', 'no', 0, False, None)
  include_list_view_settings = default_view in ('list-view', 'coverflow') \
                               or options['include_list_view_settings'] not in \
                               ('auto', 'no', 0, False, None)

  try:
    background_bmk = None

    background_color = os.environ.get('backgroundColor')
    background_file = os.environ.get('backgroundFile')

    if background_color:
      c = parseColor(background_color).to_rgb()

      icvp['backgroundType'] = 1
      icvp['backgroundColorRed'] = float(c.r)
      icvp['backgroundColorGreen'] = float(c.g)
      icvp['backgroundColorBlue'] = float(c.b)
    elif background_file:
      alias = Alias.for_file(background_file)
      background_bmk = Bookmark.for_file(background_file)

      icvp['backgroundType'] = 2
      icvp['backgroundImageAlias'] = biplist.Data(alias.to_bytes())

    image_dsstore = os.path.join(os.environ['volumePath'], '.DS_Store')

    f =  "icon_locations = {\n" + os.environ['iconLocations'] + "\n}"
    exec (f, options, options)

    with DSStore.open(image_dsstore, 'w+') as d:
      d['.']['vSrn'] = ('long', 1)
      d['.']['bwsp'] = bwsp
      if include_icon_view_settings:
        d['.']['icvp'] = icvp
        if background_bmk:
          d['.']['pBBk'] = background_bmk
      if include_list_view_settings:
        d['.']['lsvp'] = lsvp
      d['.']['icvl'] = icvl

      d['.background']['Iloc'] = (2560, 170)
      d['.DS_Store']['Iloc'] = (2610, 170)
      d['.fseventsd']['Iloc'] = (2660, 170)
      d['.Trashes']['Iloc'] = (2710, 170)
      d['.VolumeIcon.icns']['Iloc'] = (2760, 170)

      for k, v in iteritems(options['icon_locations']):
        d[k]['Iloc'] = v
  except:
    raise

build_dmg()
