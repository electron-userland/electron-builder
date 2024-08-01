#!/usr/bin/env bash
pip3 install pipenv
pipenv install
echo "Building site docs"
mkdocs build
