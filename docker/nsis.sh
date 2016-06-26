#!/usr/bin/env bash
set -e

rm -rf Docs
rm -rf NSIS.chm
rm -rf Examples
rm -rf Plugins/x86-ansi
rm -f makensisw.exe

# nsProcess plugin
curl -L http://nsis.sourceforge.net/mediawiki/images/1/18/NsProcess.zip > a.zip
7za x a.zip -oa
mv a/Plugin/nsProcessW.dll Plugins/x86-unicode/nsProcess.dll
mv a/Include/nsProcess.nsh Include/nsProcess.nsh
unlink a.zip
rm -rf a

# UAC plugin
curl -L http://nsis.sourceforge.net/mediawiki/images/8/8f/UAC.zip > a.zip
7za x a.zip -oa
mv a/Plugins/x86-unicode/UAC.dll Plugins/x86-unicode/UAC.dll
mv a/UAC.nsh Include/UAC.nsh
unlink a.zip
rm -rf a

# WinShell
curl -L http://nsis.sourceforge.net/mediawiki/images/5/54/WinShell.zip > a.zip
7za x a.zip -oa
mv a/Plugins/x86-unicode/WinShell.dll Plugins/x86-unicode/WinShell.dll
unlink a.zip
rm -rf a

# 7z
curl -L http://nsis.sourceforge.net/mediawiki/images/9/93/Nsis7z.zip > a.zip
7za x a.zip -oa
mv a/Plugins/x86-unicode/nsis7z.dll Plugins/x86-unicode/nsis7z.dll
unlink a.zip
rm -rf a

# http://nsis.sourceforge.net/SpiderBanner_plug-in
curl -L http://nsis.sourceforge.net/mediawiki/images/4/4c/SpiderBanner_plugin.zip > a.zip
7za x a.zip -oa
mv a/Plugins/x86-unicode/SpiderBanner.dll Plugins/x86-unicode/SpiderBanner.dll
unlink a.zip
rm -rf a


dir=${PWD##*/}
rm -rf ../${dir}.7z
7za a -m0=lzma2 -mx=9 -mfb=64 -md=64m -ms=on ../${dir}.7z .
