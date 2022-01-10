#!/usr/bin/env bash

set -ex

DATE=$(date +%m.%y)

echo $DATE

# docker push \
#   # electronuserland/builder:base \
#   "electronuserland/builder:base-$DATE"

# # Node 14
# docker push \
#   # electronuserland/builder:14 \
#   "electronuserland/builder:14-$DATE" \
#   # electronuserland/builder:latest

# docker push \
#   # electronuserland/builder:14-wine \
#   "electronuserland/builder:14-wine-$DATE" \
#   # electronuserland/builder:wine
# docker push \
#   # electronuserland/builder:14-wine-mono \
#   "electronuserland/builder:14-wine-mono-$DATE" \
#   # electronuserland/builder:wine-mono
# docker push \
#   # electronuserland/builder:14-wine-chrome \
#   "electronuserland/builder:14-wine-chrome-$DATE" \
#   # electronuserland/builder:wine-chrome