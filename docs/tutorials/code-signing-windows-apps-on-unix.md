!!! info Only for EV code signing certificates

    Described setup and configuration is required only if you have EV code signing certificate. The regular certificates supported [out of the box](../code-signing.md#windows).

Signing Windows apps on Unix is supported. There are multiple methods to achieve this. Basically you need an application
that is able to sign code using [PKCS 11](https://en.wikipedia.org/wiki/PKCS_11). There is one method that works on Linux
and Mac, using Java. You can also use `osslsigncode` on both systems, for Linux and Mac a how-to is included. This
documents finishes with some remarks and how to integrate the signing process with Electron Builder.  

## Signing Windows app on Mac/Linux using JSign

This method requires Java. Make sure you got Java installed before trying this solution.

1. Make sure Java is installed by running `java -v`
2. Download JSign
3. Create a file called `hardwareToken.cfg`. Fill it with the contents below.
4. Check the library link to make sure you have
the correct PKCS module. This link might be different per token. On Linux you will find it in `/lib`, while on Mac you 
can find it in `/Library/Frameworks` or `/usr/local/lib`.
5. Install token driver for Mac, export the certificate (convert it to pem when it is .cer)
6. Run `java -jar jsign-2.1.jar` with the correct parameters.

hardwareToken.cfg
```
name = HardwareToken
library = /Library/Frameworks/eToken.framework/Versions/A/libeToken.dylib
slotListIndex = 0
```

URLs:
- [JSign from Github](https://github.com/ebourg/jsign/releases) 

Full command for signing:
```
java -jar jsign-2.1.jar --keystore hardwareToken.cfg --storepass "your password here" --storetype PKCS11 --tsaurl http://timestamp.digicert.com --alias /link/to/cert.pem
```

## Signing Windows app on Mac using osslsigncode

The main problem is the lack of a engine PKCS 11 in brew that supports OpenSSL 1.1. The current version only supports
OpenSSL 1.0. Therefore you need to compile the majority of the applications yourself.

1. Install some applications with brew like `autoconf`, `automake`, `libtool`, `pkg-config` and `gnu-tar`.
2. Create folder like `/usr/local/mac-dev`, give it rights of your current user, use the folder as a prefix during compilations.
4. Download OpenSSL 1.1.1 tar.gz, see link below, extract and compile: `./config --prefix=/usr/local/mac-dev && make && make install`
5. Export OpenSSL 1.1 variables for compiling the applications below
  - `export LDFLAGS="-L/usr/local/mac-dev/lib"`
  - `export CPPFLAGS="-I/usr/local/mac-dev/include"`
  - `export PATH="/usr/local/mac-dev/bin:$PATH"`
  - `export PKG_CONFIG_PATH="/usr/local/mac-dev/lib/pkgconfig"`
6. Install opensc (.dmg file)
7. Download libp11 .tar.gz, extract and compile: `./configure --prefix=/usr/local/mac-dev && make && make install`
8. Install token driver for Mac, export the certificate (convert it to pem when it is .cer)
9. Download osslsigncode .tar.gz, extract and compile: `./autogen.sh && ./configure --prefix=/usr/local/mac-dev && make && make install` (afterwards symlink the binary to `/usr/local/bin`)
10. Figure out the key ID by running `pkcs11-tool --module /usr/local/lib/libeTPkcs11.dylib -l -O`
11. Run `osslsigncode` with the correct module, engine and key id

URLs:
- [OpenSSL 1.1 from their website](https://www.openssl.org/source/)
- [OpenSC from Github](https://github.com/OpenSC/OpenSC/releases)
- [Libp11 from Github](https://github.com/OpenSC/libp11/releases)
- [osslsigncode from Github](https://github.com/mtrojnar/osslsigncode)

Full command for signing, pkcs11module parameter might be different per token.

```sh
osslsigncode sign -verbose -pkcs11engine /usr/local/mac-dev/lib/engines-1.1/libpkcs11.dylib -pkcs11module /usr/local/lib/libeTPkcs11.dylib -h sha256 -n app-name -t https://timestamp.verisign.com/scripts/timestamp.dll -certs /link/to/cert.pem -key 'key-id-here' -pass 'password' -in /link/to/app.exe -out /link/to/app.signed.exe
```

## Signing Windows app on Ubuntu 18.04 using osslsigncode

These steps apply to other Linux operating systems too, but the names of the packages might be different.

1. Update packages using APT. `sudo apt-get update`.
2. Install packages using APT `sudo apt-get install -y openssl libcurl4-openssl-dev libssl-dev libengine-pkcs11-openssl curl libcurl4 git automake libtool pkg-config wget libccid libpcsclite1 pcscd usbutils opensc`.
3. Download osslsigncode .tar.gz, extract and compile: `./autogen.sh && ./configure && make && make install`
4. Install token driver for Linux, export the certificate (convert it to pem when it is .cer)
5. Figure out the key ID by running `pkcs11-tool --module /lib/libeToken.so -l -O`. Check the path to make sure you have
the correct PKCS module. This path might be different per token.
5. Run `osslsigncode` with the correct module, engine and key id

Full command for signing:
```sh
osslsigncode sign -verbose -pkcs11engine /usr/lib/x86_64-linux-gnu/engines-1.1/pkcs11.so -pkcs11module /lib/libeToken.so -h sha256 -n app-name -t https://timestamp.verisign.com/scripts/timestamp.dll -certs /link/to/cert.pem -key 'key-id-here' -pass 'password' -in /link/to/app.exe -out /link/to/app.signed.exe
```

URLs:
- [osslsigncode from Github](https://github.com/mtrojnar/osslsigncode)

## Remarks

Please consider the following when things are not working.

- Make sure you use the correct PKCS 11 engine and module. If you get `no slot with a token was found` or some errors 
  like `sc connect card error` and `Card is invalid or cannot be handled` you are not using the correct module, make 
  sure you use correct one.
- If you compiled OpenSSL yourself, make sure you use an engine that is also compiled for OpenSSL. Otherwise you 
  will run into *compatibility* issues.
- Use the `osslsigncode` which is mentioned in the list of URLs. There are many more forks/version to be found. The one
  included here is the actually maintained library, requires OpenSSL 1.1.
  
## Integrate signing with Electron Builder

Depending on the method you have chosen, you can automate the signing process by creating a `sign.js` file. Then point
to this file in your `package.json`.

package.json
```
...
    "win": {
      "target": "nsis",
      "sign": "./sign.js"
    },
...
```

sign.js
```js
exports.default = async function(configuration) {
  // do not include passwords or other sensitive data in the file
  // rather create environment variables with sensitive data
  const CERTIFICATE_NAME = process.env.WINDOWS_SIGN_CERTIFICATE_NAME;
  const TOKEN_PASSWORD = process.env.WINDOWS_SIGN_TOKEN_PASSWORD;

  require("child_process").execSync(
    `your command here ${CERTIFICATE_NAME} ${TOKEN_PASSWORD}`,
    {
      stdio: "inherit"
    }
  );
};
```