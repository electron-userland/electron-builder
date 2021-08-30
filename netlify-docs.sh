#!/usr/bin/env bash
sudo apt update
sudo apt -y upgrade
sudo apt install -y python3-pip

pip3 install pipenv
pipenv install
mkdocs build
