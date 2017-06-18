#!/usr/bin/env bash

rm -rf $PWD/root_certs.keychain
security create-keychain -p pass $PWD/root_certs.keychain
security set-keychain-settings $PWD/root_certs.keychain

curl https://developer.apple.com/certificationauthority/AppleWWDRCA.cer > /tmp/AppleWWDRCA.cer
security import /tmp/AppleWWDRCA.cer -k $PWD/root_certs.keychain -T /usr/bin/codesign -T /usr/bin/productbuild