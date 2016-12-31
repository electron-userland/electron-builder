#!/usr/bin/env bash

> /tmp/bundle.crt
curl https://www.startssl.com/certs/sca.code2.crt >> /tmp/bundle.crt
curl https://www.startssl.com/certs/sca.code3.crt >> /tmp/bundle.crt

curl https://repository.certum.pl/cscasha2.pem >> /tmp/bundle.crt


rm -rf $PWD/root_certs.keychain
security create-keychain -p pass $PWD/root_certs.keychain
security set-keychain-settings -t 86400 -u $PWD/root_certs.keychain

security import /tmp/bundle.crt -k $PWD/root_certs.keychain -T /usr/bin/codesign -T /usr/bin/productbuild

curl https://developer.apple.com/certificationauthority/AppleWWDRCA.cer > /tmp/AppleWWDRCA.cer
security import /tmp/AppleWWDRCA.cer -k $PWD/root_certs.keychain -T /usr/bin/codesign -T /usr/bin/productbuild