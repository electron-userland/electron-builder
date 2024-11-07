#!/bin/bash

set -ex

# Ignore lines that start with a hash (#)
# setopt INTERACTIVE_COMMENTS

# # Skip commands where the glob pattern does not match any files
# setopt null_glob

# Prepare an empty folder
BUILD_DIR="$(pwd)/lib/Release/Hello"
rm -rf "${BUILD_DIR}"
mkdir -p "${BUILD_DIR}"
cd "${BUILD_DIR}"

# BUILD DYNAMIC LIBRARY

# Compile the library source
cat << EOF > Greeter.swift
public class Greeter {
    public init() {}
    public func hello() {
        print("Hello World!")
    }
}
EOF

# Create directories for each architecture
mkdir -p arm64 x86_64

# Compile Hello.swift to object files and generate module files for each architecture
swiftc -parse-as-library \
    -emit-object -o arm64/Hello.o \
    -emit-module -module-name Hello -emit-module-path arm64/Hello.swiftmodule \
    -enable-library-evolution -emit-module-interface-path arm64/Hello.swiftinterface \
    -target arm64-apple-macosx10.9.0 \
    Greeter.swift

swiftc -parse-as-library \
    -emit-object -o x86_64/Hello.o \
    -emit-module -module-name Hello -emit-module-path x86_64/Hello.swiftmodule \
    -enable-library-evolution -emit-module-interface-path x86_64/Hello.swiftinterface \
    -target x86_64-apple-macosx10.9.0 \
    Greeter.swift

# Create a universal (fat) static library from the object files
lipo -create arm64/Hello.o x86_64/Hello.o -output Hello.o
libtool -static -o libHello.a Hello.o
rm Hello.o


# BUILD STATIC FRAMEWORK

# Create framework structure
mkdir -p Hello.framework/Versions/A/
mkdir -p Hello.framework/Versions/A/Modules
mkdir -p Hello.framework/Versions/A/Modules/Hello.swiftmodule
mkdir -p Hello.framework/Versions/A/Headers
mkdir -p Hello.framework/Versions/A/Resources

# Move static library
mv libHello.a Hello.framework/Versions/A/Hello

# Move module files
mv arm64/Hello.swiftdoc Hello.framework/Versions/A/Modules/
mv arm64/Hello.abi.json Hello.framework/Versions/A/Modules/
mv arm64/Hello.swiftsourceinfo Hello.framework/Versions/A/Modules/

mv arm64/Hello.swiftmodule Hello.framework/Versions/A/Modules/Hello.swiftmodule/arm64.swiftmodule
mv arm64/Hello.swiftinterface Hello.framework/Versions/A/Modules/Hello.swiftmodule/arm64.swiftinterface
mv arm64/Hello.private.swiftinterface Hello.framework/Versions/A/Modules/Hello.swiftmodule/arm64.private.swiftinterface

mv x86_64/Hello.swiftmodule Hello.framework/Versions/A/Modules/Hello.swiftmodule/x86_64.swiftmodule
mv x86_64/Hello.swiftinterface Hello.framework/Versions/A/Modules/Hello.swiftmodule/x86_64.swiftinterface
mv x86_64/Hello.private.swiftinterface Hello.framework/Versions/A/Modules/Hello.swiftmodule/x86_64.private.swiftinterface

# This modulemap is superfluous unless you use the library from Objetive-C.
cat << EOF > Hello.framework/Versions/A/Modules/module.modulemap
framework module Hello {
  header "HelloFramework.h"
  export *
}
EOF

# This header is superfluous unless you use the library from Objetive-C.
cat << EOF > Hello.framework/Versions/A/Headers/HelloFramework.h
#import <Foundation/Foundation.h>
void hello(void);
EOF

cat << EOF > Hello.framework/Versions/A/Info.plist
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleDevelopmentRegion</key>
    <string>en</string>
    <key>CFBundleExecutable</key>
    <string>Hello</string>
    <key>CFBundleIdentifier</key>
    <string>com.example.Hello</string>
    <key>CFBundleInfoDictionaryVersion</key>
    <string>6.0</string>
    <key>CFBundleName</key>
    <string>Hello</string>
    <key>CFBundlePackageType</key>
    <string>FMWK</string>
    <key>CFBundleShortVersionString</key>
    <string>1.0</string>
    <key>CFBundleVersion</key>
    <string>1</string>
    <key>NSHumanReadableCopyright</key>
    <string>Copyright © 2024 Hello Company. All rights reserved.</string>
</dict>
</plist>
EOF

# Create symbolic links to speed up access
cd Hello.framework/Versions
ln -s A Current
cd ..
ln -s Versions/Current/Hello Hello
ln -s Versions/Current/Headers Headers
ln -s Versions/Current/Info.plist Info.plist
ln -s Versions/Current/Resources Resources
ln -s Versions/Current/Modules Modules

cd ..
chmod -R 755 Hello.framework


# BUILD THE CLIENT

# Create UseHello.swift
cat << EOF > UseHello.swift
import Hello
@main
public struct UseHello {
    public static func main() {
        let greeter = Greeter()
        greeter.hello()
    }
}
EOF

# Compile UseHello.swift into executables for each architecture
swiftc -parse-as-library \
    -o UseHello-arm64  UseHello.swift \
    -target arm64-apple-macosx10.9.0 \
    -F. -framework Hello -I Hello.framework/Modules/arm64

swiftc -parse-as-library \
    -o UseHello-x86_64 UseHello.swift \
    -target x86_64-apple-macosx10.9.0 \
    -F. -framework Hello -I Hello.framework/Modules/x86_64

# Create a universal (fat) binary
lipo -create UseHello-arm64 UseHello-x86_64 -output UseHello

# Clean up intermediate files
rm UseHello-arm64 UseHello-x86_64

# cleanup
rm -rf arm64
rm -rf x86_64


# EXECUTE

# Execute
./UseHello


# CREATE EXECUTABLE PACKAGE

# Encapsulate the libHello.a in a xcframework
xcodebuild -create-xcframework \
    -framework Hello.framework \
    -output Hello.xcframework

# Optionally sign the framework
# security find-identity -v -p codesigning
# codesign --sign "YOUR_ID_HERE" --timestamp --options runtime Hello.xcframework

# Remove everything except the xcframework
# I’m discarding the message 'rm: Hello.xcframework: is a directory'
rm * 2>/dev/null

# Create an executable
swift package init --type executable --name UseHello

# Overwrite the Package.swift to add the dependency
cat << EOF > Package.swift
// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "UseHello",
    platforms: [.macOS(.v15)],
    products: [
        .executable(name: "UseHello", targets: ["UseHello"])
    ],
    dependencies: [],
    targets: [
        .executableTarget(name: "UseHello", dependencies: ["Hello"]),
        .binaryTarget(name: "Hello", path: "./Hello.xcframework")
    ]
)
EOF

# Replace the default main.swift file.
rm Sources/main.swift
mkdir -p Sources/UseHello
cat << EOF > Sources/UseHello/main.swift
import Hello
Greeter().hello()
EOF

swift run --arch x86_64
swift run --arch arm64
swift build --arch x86_64 --arch arm64