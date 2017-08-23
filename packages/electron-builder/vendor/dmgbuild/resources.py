# -*- coding: utf-8 -*-
from __future__ import unicode_literals

import struct

class Resource (object):
    def __init__(self, res_type, res_id, res_name, data=None, res_attrs=0):
        self.res_type = str(res_type)
        self.res_id = res_id
        if isinstance(res_name, basestring):
            res_name = str(res_name)
        self.res_name = res_name
        self.res_attrs = res_attrs
        if data is None:
            self.data = None
        self.data = str(data)

        self.data_offset = None
        self.name_offset = None

    def __repr__(self):
        return 'Resource(%r, %r, %r, data=%r, res_attrs=%r)' % (self.res_type,
                                                                self.res_id,
                                                                self.res_name,
                                                                self.data,
                                                                self.res_attrs)

class TMPLResource (Resource):
    def __init__(self, res_id, res_name, tmpl, res_attrs=0):
        data = []
        for name,typecode in tmpl:
            data.append(struct.pack(b'B', len(name)))
            data.append(str(name))
            data.append(str(typecode))
        super(TMPLResource, self).__init__(b'TMPL', res_id, res_name,
                                           b''.join(data), res_attrs)

class StringListResource (Resource):
    def __init__(self, res_id, res_name, strings, res_attrs=0):
        data = []
        data.append(struct.pack(b'>H', len(strings)))
        for s in strings:
            data.append(struct.pack(b'B', len(s)))
            data.append(str(s))
        super(StringListResource, self).__init__(b'STR#', res_id, res_name,
                                                 b''.join(data), res_attrs)

class TextResource (Resource):
    def __init__(self, res_id, res_name, string, res_attrs=0):
        super(TextResource, self).__init__(b'TEXT', res_id, res_name,
                                           str(string), res_attrs)

class Style (object):
    # Fonts
    NewYork      = 2
    Geneva       = 3
    Monaco       = 4
    Venice       = 5
    London       = 6
    Athens       = 7
    SanFrancisco = 8
    Toronto      = 9
    Cairo        = 11
    LosAngeles   = 12
    Times        = 20
    Helvetica    = 21
    Courier      = 22
    Symbol       = 23
    Mobile       = 24

    # Styles
    Bold       = 0x0100
    Italic     = 0x0200
    Underline  = 0x0400
    Outline    = 0x0800
    Shadow     = 0x1000
    Condense   = 0x2000
    Expand     = 0x4000

    def __init__(self, start_character, height, ascent, font_id, face,
                 size, color):
        self.start_character = start_character
        self.height = height
        self.ascent = ascent
        self.font_id = font_id
        self.face = face
        self.size = size
        self.color = color

    def __repr__(self):
        styles = []
        if self.face & Style.Bold:
            styles.append('Style.Bold')
        if self.face & Style.Italic:
            styles.append('Style.Italic')
        if self.face & Style.Underline:
            styles.append('Style.Underline')
        if self.face & Style.Outline:
            styles.append('Style.Outline')
        if self.face & Style.Shadow:
            styles.append('Style.Shadow')
        if self.face & Style.Condense:
            styles.append('Style.Condense')
        if self.face & Style.Expand:
            styles.append('Style.Expand')
        if self.face & ~0x4f00:
            styles.append('%#06x' % (self.face & ~0x4f00))
        if styles:
            styles = '|'.join(styles)
        else:
            styles = '0'

        font_revmap = {
             2: 'Style.NewYork',
             3: 'Style.Geneva',
             4: 'Style.Monaco',
             5: 'Style.Venice',
             6: 'Style.London',
             7: 'Style.Athens',
             8: 'Style.SanFrancisco',
             9: 'Style.Toronto',
            11: 'Style.Cairo',
            12: 'Style.LosAngeles',
            20: 'Style.Times',
            21: 'Style.Helvetica',
            22: 'Style.Courier',
            23: 'Style.Symbol',
            24: 'Style.Mobile'
        }

        font = font_revmap.get(self.font_id, '%s' % self.font_id)

        return 'Style(%r, %r, %r, %s, %s, %r, %r)' % (
            self.start_character,
            self.height,
            self.ascent,
            font,
            styles,
            self.size,
            self.color)

class StyleResource (Resource):
    def __init__(self, res_id, res_name, styles, res_attrs=0):
        data = []
        data.append(struct.pack(b'>H', len(styles)))
        for style in styles:
            data.append(struct.pack(b'>LHHHHHHHH',
                                    style.start_character,
                                    style.height,
                                    style.ascent,
                                    style.font_id,
                                    style.face,
                                    style.size,
                                    style.color[0],
                                    style.color[1],
                                    style.color[2]))
        super(StyleResource, self).__init__(b'styl', res_id, res_name,
                                            b''.join(data), res_attrs)

class ResourceFork (object):
    def __init__(self, resources=None):
        self.types = {}
        self.attrs = 0
        if resources is not None:
            for res in resources:
                self.add(res)

    @classmethod
    def from_data(clss, data):
        if len(data) < 16:
            raise ValueError('Bad resource data - data too short')

        # Read the header
        data_start, map_start, data_len, map_len = struct.unpack(b'>LLLL',
                                                                 data[0:16])

        if data_start + data_len > len(data):
            raise ValueError('Bad resource data - data out of range')
        if map_start + map_len > len(data):
            raise ValueError('Bad resource data - map out of range')
        if map_len < 30:
            raise ValueError('Bad resource data - map too short')

        # Read the map header
        fork_attrs, type_offset, name_offset, max_type_ndx \
            = struct.unpack(b'>HHHH', data[map_start + 22:map_start + 30])
        num_types = max_type_ndx + 1

        if type_offset + 8 * num_types > map_len:
            raise ValueError('Bad resource data - type data outside map')

        if name_offset > map_len:
            raise ValueError('Bad resource data - names outside map')

        type_offset += map_start
        name_offset += map_start

        result = ResourceFork()

        # Now read the type list
        for ntype in range(0, num_types):
            type_pos = 2 + type_offset + 8 * ntype
            res_type, max_item_ndx, ref_offset \
                = struct.unpack(b'>4sHH', data[type_pos:type_pos+8])
            num_items = max_item_ndx + 1

            result.types[res_type] = []

            ref_list_offset = type_offset + ref_offset
            if ref_list_offset + 12 * num_items > map_start + map_len:
                raise ValueError('Bad resource data - ref list outside map')

            for nitem in range(0, num_items):
                ref_elt = ref_list_offset + 12 * nitem
                res_id, res_name_offset, data_offset \
                    = struct.unpack(b'>hHL', data[ref_elt:ref_elt+8])

                res_attrs = data_offset >> 24
                data_offset &= 0xffffff

                if data_offset >= data_len:
                    raise ValueError('Bad resource data - item data out of range')

                data_offset += data_start
                res_len = struct.unpack(b'>L', data[data_offset:data_offset+4])[0]
                if data_offset + res_len >= data_start + data_len:
                    raise ValueError('Bad resource data - item data too large')

                res_data = data[data_offset + 4:data_offset + res_len + 4]

                if res_name_offset == 0xffff:
                    res_name = None
                else:
                    res_name_offset += name_offset
                    if res_name_offset >= map_start + map_len:
                        raise ValueError('Bad resource data - name out of range')
                    res_name_len = struct.unpack(b'B', data[res_name_offset])[0]
                    res_name = data[res_name_offset + 1:res_name_offset + res_name_len + 1]

                result.types[res_type].append(Resource(res_type, res_id,
                                                       res_name,
                                                       res_data, res_attrs))

        return result

    @classmethod
    def from_file(clss, filename):
        with open(filename + '/..namedfork/rsrc', 'rb') as f:
            data = f.read()
        return clss.from_data(data)

    def to_data(self):
        data = []
        data_len = 0
        names = []
        names_len = 0
        types_len = len(self.types) * 8
        types_data = []
        reflist_data = []
        reflist_len = 0

        for res_type, items in self.types.items():
            types_data.append(struct.pack(b'>4sHH',
                                          res_type,
                                          len(items) - 1,
                                          2 + types_len + reflist_len))
            for item in items:
                data_offset = data_len

                if item.res_name is None:
                    name_offset = 65535
                else:
                    name_offset = names_len
                    n = str(item.res_name)
                    names.append(struct.pack(b'B', len(n)) + n)
                    names_len += 1 + len(n)

                if item.data is None:
                    data_len += 4
                else:
                    data_len += 4 + (len(item.data) + 3) & ~3

                reflist_len += 12
                reflist_data.append(struct.pack(b'>hHLL',
                                                item.res_id,
                                                name_offset,
                                                (item.res_attrs << 24) \
                                                | data_offset,
                                                0))

        # Header
        data.append(struct.pack(b'>LLLL240s', 256, 256 + data_len, data_len,
                                30 + types_len + reflist_len + names_len,
                                b''))

        # Resource data
        for res_type, items in self.types.items():
            for item in items:
                if item.data is None:
                    dlen = 0
                else:
                    dlen = len(item.data)
                plen = (dlen + 3) & ~3
                data.append(struct.pack(b'>L', dlen))
                if item.data is not None:
                    data.append(item.data)
                if plen != dlen:
                    data.append(b'\0' * (plen - dlen))

        # Resource map header
        data.append(struct.pack(b'>16sLHHHHH',
                                b'', 0, 0,
                                self.attrs, 28, 30 + types_len + reflist_len,
                                len(self.types) - 1))

        # Type list
        data.append(b''.join(types_data))

        # Reference lists
        data.append(b''.join(reflist_data))

        # Name list
        data.append(b''.join(names))

        return b''.join(data)

    def write_to_file(self, filename):
        with open(filename + '/..namedfork/rsrc', 'wb') as f:
            f.write(self.to_data())

    def __len__(self):
        return len(self.types)

    def __getitem__(self, key):
        return self.types[key]

    def __iter__(self):
        for res_type, items in self.types.items():
            for item in items:
                yield item

    def __repr__(self):
        output = []
        for item in self:
            output.append(repr(item))
        return 'ResourceFork([%s])' % ', '.join(output)

    def add(self, res):
        if res.res_type in self.types:
            self.types[res.res_type].append(res)
        else:
            self.types[res.res_type] = [res]

    def remove(self, res):
        self.types[res.res_type].remove(res)
