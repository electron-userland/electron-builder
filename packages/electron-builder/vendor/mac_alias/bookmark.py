# -*- coding: utf-8 -*-
#
#  This file implements the Apple "bookmark" format, which is the replacement
#  for the old-fashioned alias format.  The details of this format were
#  reverse engineered; some things are still not entirely clear.
#
from __future__ import unicode_literals, print_function

import struct
import uuid
import datetime
import os
import sys
import pprint

try:
    from urlparse import urljoin
except ImportError:
    from urllib.parse import urljoin

if sys.platform == 'darwin':
    from . import osx

def iteritems(x):
    return x.iteritems()

try:
    unicode
except NameError:
    unicode = str
    long = int
    xrange = range
    def iteritems(x):
        return x.items()

from .utils import *

BMK_DATA_TYPE_MASK    = 0xffffff00
BMK_DATA_SUBTYPE_MASK = 0x000000ff

BMK_STRING  = 0x0100
BMK_DATA    = 0x0200
BMK_NUMBER  = 0x0300
BMK_DATE    = 0x0400
BMK_BOOLEAN = 0x0500
BMK_ARRAY   = 0x0600
BMK_DICT    = 0x0700
BMK_UUID    = 0x0800
BMK_URL     = 0x0900
BMK_NULL    = 0x0a00

BMK_ST_ZERO = 0x0000
BMK_ST_ONE  = 0x0001

BMK_BOOLEAN_ST_FALSE = 0x0000
BMK_BOOLEAN_ST_TRUE  = 0x0001

# Subtypes for BMK_NUMBER are really CFNumberType values
kCFNumberSInt8Type = 1
kCFNumberSInt16Type = 2
kCFNumberSInt32Type = 3
kCFNumberSInt64Type = 4
kCFNumberFloat32Type = 5
kCFNumberFloat64Type = 6
kCFNumberCharType = 7
kCFNumberShortType = 8
kCFNumberIntType = 9
kCFNumberLongType = 10
kCFNumberLongLongType = 11
kCFNumberFloatType = 12
kCFNumberDoubleType = 13
kCFNumberCFIndexType = 14
kCFNumberNSIntegerType = 15
kCFNumberCGFloatType = 16

# Resource property flags (from CFURLPriv.h)
kCFURLResourceIsRegularFile      = 0x00000001
kCFURLResourceIsDirectory        = 0x00000002
kCFURLResourceIsSymbolicLink     = 0x00000004
kCFURLResourceIsVolume           = 0x00000008
kCFURLResourceIsPackage          = 0x00000010
kCFURLResourceIsSystemImmutable  = 0x00000020
kCFURLResourceIsUserImmutable    = 0x00000040
kCFURLResourceIsHidden           = 0x00000080
kCFURLResourceHasHiddenExtension = 0x00000100
kCFURLResourceIsApplication      = 0x00000200
kCFURLResourceIsCompressed       = 0x00000400
kCFURLResourceIsSystemCompressed = 0x00000400
kCFURLCanSetHiddenExtension      = 0x00000800
kCFURLResourceIsReadable         = 0x00001000
kCFURLResourceIsWriteable        = 0x00002000
kCFURLResourceIsExecutable       = 0x00004000
kCFURLIsAliasFile                = 0x00008000
kCFURLIsMountTrigger             = 0x00010000

# Volume property flags (from CFURLPriv.h)
kCFURLVolumeIsLocal                         =                0x1 #
kCFURLVolumeIsAutomount                     =                0x2 #
kCFURLVolumeDontBrowse                      =                0x4 #
kCFURLVolumeIsReadOnly                      =                0x8 #
kCFURLVolumeIsQuarantined                   =               0x10
kCFURLVolumeIsEjectable                     =               0x20 #
kCFURLVolumeIsRemovable                     =               0x40 #
kCFURLVolumeIsInternal                      =               0x80 #
kCFURLVolumeIsExternal                      =              0x100 #
kCFURLVolumeIsDiskImage                     =              0x200 #
kCFURLVolumeIsFileVault                     =              0x400
kCFURLVolumeIsLocaliDiskMirror              =              0x800
kCFURLVolumeIsiPod                          =             0x1000 #
kCFURLVolumeIsiDisk                         =             0x2000
kCFURLVolumeIsCD                            =             0x4000
kCFURLVolumeIsDVD                           =             0x8000
kCFURLVolumeIsDeviceFileSystem              =            0x10000
kCFURLVolumeSupportsPersistentIDs           =        0x100000000
kCFURLVolumeSupportsSearchFS                =        0x200000000
kCFURLVolumeSupportsExchange                =        0x400000000
# reserved                                           0x800000000
kCFURLVolumeSupportsSymbolicLinks           =       0x1000000000
kCFURLVolumeSupportsDenyModes               =       0x2000000000
kCFURLVolumeSupportsCopyFile                =       0x4000000000
kCFURLVolumeSupportsReadDirAttr             =       0x8000000000
kCFURLVolumeSupportsJournaling              =      0x10000000000
kCFURLVolumeSupportsRename                  =      0x20000000000
kCFURLVolumeSupportsFastStatFS              =      0x40000000000
kCFURLVolumeSupportsCaseSensitiveNames      =      0x80000000000
kCFURLVolumeSupportsCasePreservedNames      =     0x100000000000
kCFURLVolumeSupportsFLock                   =     0x200000000000
kCFURLVolumeHasNoRootDirectoryTimes         =     0x400000000000
kCFURLVolumeSupportsExtendedSecurity        =     0x800000000000
kCFURLVolumeSupports2TBFileSize             =    0x1000000000000
kCFURLVolumeSupportsHardLinks               =    0x2000000000000
kCFURLVolumeSupportsMandatoryByteRangeLocks =    0x4000000000000
kCFURLVolumeSupportsPathFromID              =    0x8000000000000
# reserved                                      0x10000000000000
kCFURLVolumeIsJournaling                    =   0x20000000000000
kCFURLVolumeSupportsSparseFiles             =   0x40000000000000
kCFURLVolumeSupportsZeroRuns                =   0x80000000000000
kCFURLVolumeSupportsVolumeSizes             =  0x100000000000000
kCFURLVolumeSupportsRemoteEvents            =  0x200000000000000
kCFURLVolumeSupportsHiddenFiles             =  0x400000000000000
kCFURLVolumeSupportsDecmpFSCompression      =  0x800000000000000
kCFURLVolumeHas64BitObjectIDs               = 0x1000000000000000
kCFURLVolumePropertyFlagsAll                = 0xffffffffffffffff

BMK_URL_ST_ABSOLUTE = 0x0001
BMK_URL_ST_RELATIVE = 0x0002

# Bookmark keys
#                           = 0x1003
kBookmarkPath               = 0x1004   # Array of path components
kBookmarkCNIDPath           = 0x1005   # Array of CNIDs
kBookmarkFileProperties     = 0x1010   # (CFURL rp flags,
                                       #  CFURL rp flags asked for,
                                       #  8 bytes NULL)
kBookmarkFileName           = 0x1020
kBookmarkFileID             = 0x1030
kBookmarkFileCreationDate   = 0x1040
#                           = 0x1054   # ?
#                           = 0x1055   # ?
#                           = 0x1056   # ?
#                           = 0x1101   # ?
#                           = 0x1102   # ?
kBookmarkTOCPath            = 0x2000   # A list of (TOC id, ?) pairs
kBookmarkVolumePath         = 0x2002
kBookmarkVolumeURL          = 0x2005
kBookmarkVolumeName         = 0x2010
kBookmarkVolumeUUID         = 0x2011   # Stored (perversely) as a string
kBookmarkVolumeSize         = 0x2012
kBookmarkVolumeCreationDate = 0x2013
kBookmarkVolumeProperties   = 0x2020   # (CFURL vp flags,
                                       #  CFURL vp flags asked for,
                                       #  8 bytes NULL)
kBookmarkVolumeIsRoot       = 0x2030   # True if volume is FS root
kBookmarkVolumeBookmark     = 0x2040   # Embedded bookmark for disk image (TOC id)
kBookmarkVolumeMountPoint   = 0x2050   # A URL
#                           = 0x2070
kBookmarkContainingFolder   = 0xc001   # Index of containing folder in path
kBookmarkUserName           = 0xc011   # User that created bookmark
kBookmarkUID                = 0xc012   # UID that created bookmark
kBookmarkWasFileReference   = 0xd001   # True if the URL was a file reference
kBookmarkCreationOptions    = 0xd010
kBookmarkURLLengths         = 0xe003   # See below
#                           = 0xf017   # Localized name?
#                           = 0xf022
kBookmarkSecurityExtension  = 0xf080
#                           = 0xf081

# kBookmarkURLLengths is an array that is set if the URL encoded by the
# bookmark had a base URL; in that case, each entry is the length of the
# base URL in question.  Thus a URL
#
#     file:///foo/bar/baz    blam/blat.html
#
# will result in [3, 2], while the URL
#
#     file:///foo    bar/baz    blam    blat.html
#
# would result in [1, 2, 1, 1]


class Data (object):
    def __init__(self, bytedata=None):
        #: The bytes, stored as a byte string
        self.bytes = bytes(bytedata)

    def __repr__(self):
        return 'Data(%r)' % self.bytes

class URL (object):
    def __init__(self, base, rel=None):
        if rel is not None:
            #: The base URL, if any (a :class:`URL`)
            self.base = base
            #: The rest of the URL (a string)
            self.relative = rel
        else:
            self.base = None
            self.relative = base

    @property
    def absolute(self):
        """Return an absolute URL."""
        if self.base is None:
            return self.relative
        else:
            base_abs = self.base.absolute
            return urljoin(self.base.absolute, self.relative)

    def __repr__(self):
        return 'URL(%r)' % self.absolute

class Bookmark (object):
    def __init__(self, tocs=None):
        if tocs is None:
            #: The TOCs for this Bookmark
            self.tocs = []
        else:
            self.tocs = tocs

    @classmethod
    def _get_item(cls, data, hdrsize, offset):
        offset += hdrsize
        if offset > len(data) - 8:
            raise ValueError('Offset out of range')

        length,typecode = struct.unpack(b'<II', data[offset:offset+8])

        if len(data) - offset < 8 + length:
            raise ValueError('Data item truncated')

        databytes = data[offset+8:offset+8+length]

        dsubtype = typecode & BMK_DATA_SUBTYPE_MASK
        dtype = typecode & BMK_DATA_TYPE_MASK

        if dtype == BMK_STRING:
            return databytes.decode('utf-8')
        elif dtype == BMK_DATA:
            return Data(databytes)
        elif dtype == BMK_NUMBER:
            if dsubtype == kCFNumberSInt8Type:
                return ord(databytes[0])
            elif dsubtype == kCFNumberSInt16Type:
                return struct.unpack(b'<h', databytes)[0]
            elif dsubtype == kCFNumberSInt32Type:
                return struct.unpack(b'<i', databytes)[0]
            elif dsubtype == kCFNumberSInt64Type:
                return struct.unpack(b'<q', databytes)[0]
            elif dsubtype == kCFNumberFloat32Type:
                return struct.unpack(b'<f', databytes)[0]
            elif dsubtype == kCFNumberFloat64Type:
                return struct.unpack(b'<d', databytes)[0]
        elif dtype == BMK_DATE:
            # Yes, dates really are stored as *BIG-endian* doubles; everything
            # else is little-endian
            secs = datetime.timedelta(seconds=struct.unpack(b'>d', databytes)[0])
            return osx_epoch + secs
        elif dtype == BMK_BOOLEAN:
            if dsubtype == BMK_BOOLEAN_ST_TRUE:
                return True
            elif dsubtype == BMK_BOOLEAN_ST_FALSE:
                return False
        elif dtype == BMK_UUID:
            return uuid.UUID(bytes=databytes)
        elif dtype == BMK_URL:
            if dsubtype == BMK_URL_ST_ABSOLUTE:
                return URL(databytes.decode('utf-8'))
            elif dsubtype == BMK_URL_ST_RELATIVE:
                baseoff,reloff = struct.unpack(b'<II', databytes)
                base = cls._get_item(data, hdrsize, baseoff)
                rel = cls._get_item(data, hdrsize, reloff)
                return URL(base, rel)
        elif dtype == BMK_ARRAY:
            result = []
            for aoff in xrange(offset+8,offset+8+length,4):
                eltoff, = struct.unpack(b'<I', data[aoff:aoff+4])
                result.append(cls._get_item(data, hdrsize, eltoff))
            return result
        elif dtype == BMK_DICT:
            result = {}
            for eoff in xrange(offset+8,offset+8+length,8):
                keyoff,valoff = struct.unpack(b'<II', data[eoff:eoff+8])
                key = cls._get_item(data, hdrsize, keyoff)
                val = cls._get_item(data, hdrsize, valoff)
                result[key] = val
            return result
        elif dtype == BMK_NULL:
            return None

        print('Unknown data type %08x' % typecode)
        return (typecode, databytes)

    @classmethod
    def from_bytes(cls, data):
        """Create a :class:`Bookmark` given byte data."""

        if len(data) < 16:
            raise ValueError('Not a bookmark file (too short)')

        if isinstance(data, bytearray):
            data = bytes(data)

        magic,size,dummy,hdrsize = struct.unpack(b'<4sIII', data[0:16])

        if magic != b'book':
            raise ValueError('Not a bookmark file (bad magic) %r' % magic)

        if hdrsize < 16:
            raise ValueError('Not a bookmark file (header size too short)')

        if hdrsize > size:
            raise ValueError('Not a bookmark file (header size too large)')

        if size != len(data):
            raise ValueError('Not a bookmark file (truncated)')

        tocoffset, = struct.unpack(b'<I', data[hdrsize:hdrsize+4])

        tocs = []

        while tocoffset != 0:
            tocbase = hdrsize + tocoffset
            if tocoffset > size - hdrsize \
              or size - tocbase < 20:
                raise ValueError('TOC offset out of range')

            tocsize,tocmagic,tocid,nexttoc,toccount \
                = struct.unpack(b'<IIIII',
                                data[tocbase:tocbase+20])

            if tocmagic != 0xfffffffe:
                break

            tocsize += 8

            if size - tocbase < tocsize:
                raise ValueError('TOC truncated')

            if tocsize < 12 * toccount:
                raise ValueError('TOC entries overrun TOC size')

            toc = {}
            for n in xrange(0,toccount):
                ebase = tocbase + 20 + 12 * n
                eid,eoffset,edummy = struct.unpack(b'<III',
                                                   data[ebase:ebase+12])

                if eid & 0x80000000:
                    eid = cls._get_item(data, hdrsize, eid & 0x7fffffff)

                toc[eid] = cls._get_item(data, hdrsize, eoffset)

            tocs.append((tocid, toc))

            tocoffset = nexttoc

        return cls(tocs)

    def __getitem__(self, key):
        for tid,toc in self.tocs:
            if key in toc:
                return toc[key]
        raise KeyError('Key not found')

    def __setitem__(self, key, value):
        if len(self.tocs) == 0:
            self.tocs = [(1, {})]
        self.tocs[0][1][key] = value

    def get(self, key, default=None):
        """Lookup the value for a given key, returning a default if not
        present."""
        for tid,toc in self.tocs:
            if key in toc:
                return toc[key]
        return default

    @classmethod
    def _encode_item(cls, item, offset):
        if item is True:
            result = struct.pack(b'<II', 0, BMK_BOOLEAN | BMK_BOOLEAN_ST_TRUE)
        elif item is False:
            result = struct.pack(b'<II', 0, BMK_BOOLEAN | BMK_BOOLEAN_ST_FALSE)
        elif isinstance(item, unicode):
            encoded = item.encode('utf-8')
            result = (struct.pack(b'<II', len(encoded), BMK_STRING | BMK_ST_ONE)
                      + encoded)
        elif isinstance(item, bytes):
            result = (struct.pack(b'<II', len(item), BMK_STRING | BMK_ST_ONE)
                      + item)
        elif isinstance(item, Data):
            result = (struct.pack(b'<II', len(item.bytes),
                                  BMK_DATA | BMK_ST_ONE)
                      + bytes(item.bytes))
        elif isinstance(item, bytearray):
            result = (struct.pack(b'<II', len(item),
                                  BMK_DATA | BMK_ST_ONE)
                      + bytes(item))
        elif isinstance(item, int) or isinstance(item, long):
            if item > -0x80000000 and item < 0x7fffffff:
                result = struct.pack(b'<IIi', 4,
                                     BMK_NUMBER | kCFNumberSInt32Type, item)
            else:
                result = struct.pack(b'<IIq', 8,
                                     BMK_NUMBER | kCFNumberSInt64Type, item)
        elif isinstance(item, float):
            result = struct.pack(b'<IId', 8,
                                 BMK_NUMBER | kCFNumberFloat64Type, item)
        elif isinstance(item, datetime.datetime):
            secs = item - osx_epoch
            result = struct.pack(b'<II', 8, BMK_DATE | BMK_ST_ZERO) \
                     + struct.pack(b'>d', float(secs.total_seconds()))
        elif isinstance(item, uuid.UUID):
            result = struct.pack(b'<II', 16, BMK_UUID | BMK_ST_ONE) \
                     + item.bytes
        elif isinstance(item, URL):
            if item.base:
                baseoff = offset + 16
                reloff, baseenc = cls._encode_item(item.base, baseoff)
                xoffset, relenc = cls._encode_item(item.relative, reloff)
                result = b''.join([
                    struct.pack(b'<IIII', 8, BMK_URL | BMK_URL_ST_RELATIVE,
                                baseoff, reloff),
                    baseenc,
                    relenc])
            else:
                encoded = item.relative.encode('utf-8')
                result = struct.pack(b'<II', len(encoded),
                                     BMK_URL | BMK_URL_ST_ABSOLUTE) + encoded
        elif isinstance(item, list):
            ioffset = offset + 8 + len(item) * 4
            result = [struct.pack(b'<II', len(item) * 4, BMK_ARRAY | BMK_ST_ONE)]
            enc = []
            for elt in item:
                result.append(struct.pack(b'<I', ioffset))
                ioffset, ienc = cls._encode_item(elt, ioffset)
                enc.append(ienc)
            result = b''.join(result + enc)
        elif isinstance(item, dict):
            ioffset = offset + 8 + len(item) * 8
            result = [struct.pack(b'<II', len(item) * 8, BMK_DICT | BMK_ST_ONE)]
            enc = []
            for k,v in iteritems(item):
                result.append(struct.pack(b'<I', ioffset))
                ioffset, ienc = cls._encode_item(k, ioffset)
                enc.append(ienc)
                result.append(struct.pack(b'<I', ioffset))
                ioffset, ienc = cls._encode_item(v, ioffset)
                enc.append(ienc)
            result = b''.join(result + enc)
        elif item is None:
            result = struct.pack(b'<II', 0, BMK_NULL | BMK_ST_ONE)
        else:
            raise ValueError('Unknown item type when encoding: %s' % item)

        offset += len(result)

        # Pad to a multiple of 4 bytes
        if offset & 3:
            extra = 4 - (offset & 3)
            result += b'\0' * extra
            offset += extra

        return (offset, result)

    def to_bytes(self):
        """Convert this :class:`Bookmark` to a byte representation."""

        result = []
        tocs = []
        offset = 4  # For the offset to the first TOC

        # Generate the data and build the TOCs
        for tid,toc in self.tocs:
            entries = []

            for k,v in iteritems(toc):
                if isinstance(k, (str, unicode)):
                    noffset = offset
                    voffset, enc = self._encode_item(k, offset)
                    result.append(enc)
                    offset, enc = self._encode_item(v, voffset)
                    result.append(enc)
                    entries.append((noffset | 0x80000000, voffset))
                else:
                    entries.append((k, offset))
                    offset, enc = self._encode_item(v, offset)
                    result.append(enc)

            # TOC entries must be sorted - CoreServicesInternal does a
            # binary search to find data
            entries.sort()

            tocs.append((tid, b''.join([struct.pack(b'<III',k,o,0)
                                        for k,o in entries])))

        first_toc_offset = offset

        # Now generate the TOC headers
        for ndx,toc in enumerate(tocs):
            tid, data = toc
            if ndx == len(tocs) - 1:
                next_offset = 0
            else:
                next_offset = offset + 20 + len(data)

            result.append(struct.pack(b'<IIIII', len(data) - 8,
                                      0xfffffffe,
                                      tid,
                                      next_offset,
                                      len(data) // 12))
            result.append(data)

            offset += 20 + len(data)

        # Finally, add the header (and the first TOC offset, which isn't part
        # of the header, but goes just after it)
        header = struct.pack(b'<4sIIIQQQQI', b'book',
                             offset + 48,
                             0x10040000,
                             48,
                             0, 0, 0, 0, first_toc_offset)

        result.insert(0, header)

        return b''.join(result)

    @classmethod
    def for_file(cls, path):
        """Construct a :class:`Bookmark` for a given file."""

        # Find the filesystem
        st = osx.statfs(path)
        vol_path = st.f_mntonname.decode('utf-8')

        # Grab its attributes
        attrs = [osx.ATTR_CMN_CRTIME,
                 osx.ATTR_VOL_SIZE
                 | osx.ATTR_VOL_NAME
                 | osx.ATTR_VOL_UUID,
                 0, 0, 0]
        volinfo = osx.getattrlist(vol_path, attrs, 0)

        vol_crtime = volinfo[0]
        vol_size = volinfo[1]
        vol_name = volinfo[2]
        vol_uuid = volinfo[3]

        # Also grab various attributes of the file
        attrs = [(osx.ATTR_CMN_OBJTYPE
                  | osx.ATTR_CMN_CRTIME
                  | osx.ATTR_CMN_FILEID), 0, 0, 0, 0]
        info = osx.getattrlist(path, attrs, osx.FSOPT_NOFOLLOW)

        cnid = info[2]
        crtime = info[1]

        if info[0] == osx.VREG:
            flags = kCFURLResourceIsRegularFile
        elif info[0] == osx.VDIR:
            flags = kCFURLResourceIsDirectory
        elif info[0] == osx.VLNK:
            flags = kCFURLResourceIsSymbolicLink
        else:
            flags = kCFURLResourceIsRegularFile

        dirname, filename = os.path.split(path)

        relcount = 0
        if not os.path.isabs(dirname):
            curdir = os.getcwd()
            head, tail = os.path.split(curdir)
            relcount = 0
            while head and tail:
                relcount += 1
                head, tail = os.path.split(head)
            dirname = os.path.join(curdir, dirname)

        foldername = os.path.basename(dirname)

        rel_path = os.path.relpath(path, vol_path)

        # Build the path arrays
        name_path = []
        cnid_path = []
        head, tail = os.path.split(rel_path)
        if not tail:
            head, tail = os.path.split(head)
        while head or tail:
            if head:
                attrs = [osx.ATTR_CMN_FILEID, 0, 0, 0, 0]
                info = osx.getattrlist(os.path.join(vol_path, head), attrs, 0)
                cnid_path.insert(0, info[0])
                head, tail = os.path.split(head)
                name_path.insert(0, tail)
            else:
                head, tail = os.path.split(head)
        name_path.append(filename)
        cnid_path.append(cnid)

        url_lengths = [relcount, len(name_path) - relcount]

        fileprops = Data(struct.pack(b'<QQQ', flags, 0x0f, 0))
        volprops = Data(struct.pack(b'<QQQ', 0x81 | kCFURLVolumeSupportsPersistentIDs,
                                    0x13ef | kCFURLVolumeSupportsPersistentIDs, 0))

        toc = {
            kBookmarkPath: name_path,
            kBookmarkCNIDPath: cnid_path,
            kBookmarkFileCreationDate: crtime,
            kBookmarkFileProperties: fileprops,
            kBookmarkContainingFolder: len(name_path) - 2,
            kBookmarkVolumePath: vol_path,
            kBookmarkVolumeIsRoot: vol_path == '/',
            kBookmarkVolumeURL: URL('file://' + vol_path),
            kBookmarkVolumeName: vol_name,
            kBookmarkVolumeSize: vol_size,
            kBookmarkVolumeCreationDate: vol_crtime,
            kBookmarkVolumeUUID: str(vol_uuid).upper(),
            kBookmarkVolumeProperties: volprops,
            kBookmarkCreationOptions: 512,
            kBookmarkWasFileReference: True,
            kBookmarkUserName: 'unknown',
            kBookmarkUID: 99,
        }

        if relcount:
            toc[kBookmarkURLLengths] = url_lengths

        return Bookmark([(1, toc)])

    def __repr__(self):
        result = ['Bookmark([']
        for tid,toc in self.tocs:
            result.append('(0x%x, {\n' % tid)
            for k,v in iteritems(toc):
                if isinstance(k, (str, unicode)):
                    kf = repr(k)
                else:
                    kf = '0x%04x' % k
                result.append('  %s: %r\n' % (kf, v))
            result.append('}),\n')
        result.append('])')

        return ''.join(result)
