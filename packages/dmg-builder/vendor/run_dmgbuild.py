#!/usr/bin/env python3
import sys
import os

# Add only the 'vendor' root directory to sys.path
VENDOR = os.path.dirname(os.path.abspath(__file__))
print(f"Adding {VENDOR} to sys.path")
sys.path.insert(0, VENDOR)

# Now run the CLI entry point from dmgbuild
from dmgbuild.__main__ import main

if __name__ == "__main__":
    sys.exit(main())