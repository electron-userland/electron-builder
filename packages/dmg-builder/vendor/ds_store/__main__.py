#!/usr/bin/env python
#
#  ds_store: Examine .DS_Store files.
#

import argparse
import os
import os.path
import pprint
import re
import sys

from ds_store import DSStore
from ds_store.buddy import BuddyError

_not_printable_re = re.compile(rb"[\x00-\x1f\x7f-\x9f]")


def usage():
    print(main.__doc__)
    sys.exit(0)


def chunks(iterable, length):
    for i in range(0, len(iterable), length):
        yield i, iterable[i : i + length]


def pretty(value):
    if isinstance(value, dict):
        return f"{{\n {pprint.pformat(value, indent=4)[1:-1]}\n}}"
    elif isinstance(value, bytearray):
        lines = ["["]
        for offset, chunk in chunks(value, 16):
            printable_chunk = _not_printable_re.sub(b".", chunk).decode("latin-1")
            hex_line = " ".join([f"{b:02x}" for b in chunk])
            line = f"  {offset:08x}  {hex_line:<47s}  {printable_chunk}"
            lines.append(line)
        lines.append("]")
        return "\n".join(lines)
    elif isinstance(value, bytes):
        return value.decode("latin-1")
    else:
        return value


def main(argv):
    """Display the contents of the .DS_Store file at the specified path.

    If you specify just a directory, ds_store will inspect the .DS_Store
    file in that directory.  If no paths are specified, ds_store will
    display the contents of the .DS_Store file in the current directory.
    """

    parser = argparse.ArgumentParser(description=main.__doc__)
    parser.add_argument("paths", nargs="*")
    args = parser.parse_args(argv)

    if len(args.paths) == 0:
        args.paths = ["."]

    failed = False
    for path in args.paths:
        if os.path.isdir(path):
            path = os.path.join(path, ".DS_Store")

        if not os.path.exists(path) or not os.path.isfile(path):
            print(f"ds_store: {path} not found", file=sys.stderr)
            failed = True
            continue

        try:
            with DSStore.open(path, "r") as d:
                print(path)
                print("")

                max_name_len = 0
                for entry in d:
                    name_len = len(entry.filename)
                    if name_len > max_name_len:
                        max_name_len = name_len

                for entry in d:
                    print(
                        "{:<{width}} {} {}".format(
                            entry.filename,
                            entry.code.decode("latin-1"),
                            pretty(entry.value),
                            width=max_name_len,
                        )
                    )
                print("")
        except BuddyError as e:
            print(f"ds_store: {path}: {e}")
            failed = True

    if failed:
        sys.exit(1)


if __name__ == "__main__":
    main(sys.argv[1:])
