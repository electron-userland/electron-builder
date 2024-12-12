Windows code signing is supported. If the configuration values are provided correctly in your package.json, then signing should be automatically executed.

!!! tip
    Windows is dual code-signed (SHA1 & SHA256 hashing algorithms).

To sign an app on Windows, there are two types of certificates:

* EV Code Signing Certificate
* Code Signing Certificate

Both certificates work with auto-update. The regular (and often cheaper) Code Signing Certificate shows a warning during installation that goes away once enough users installed your application and you've built up trust. The EV Certificate has more trust and thus works immediately without any warnings. However, it is not possible to export the EV Certificate as it is bound to a physical USB dongle. Thus, you can't export the certificate for signing code on a CI, such as AppVeyor.

If you are using an EV Certificate, you need to provide [win.certificateSubjectName](./win.md#WindowsConfiguration-certificateSubjectName) in your electron-builder configuration.

If you use Windows 7, please ensure that [PowerShell](https://blogs.technet.microsoft.com/heyscriptingguy/2013/06/02/weekend-scripter-install-powershell-3-0-on-windows-7/) is updated to version 3.0.

If you are on Linux or Mac and you want sign a Windows app using EV Code Signing Certificate, please use [the guide for Unix systems](tutorials/code-signing-windows-apps-on-unix.md).

## Using with Azure Trusted Signing (beta)

To sign using Azure Tenant account, you'll need the following env variables set that are read directly by `Invoke-TrustedSigning` module; they are not parsed or resolved by electron-builder.

!!! tip
  Descriptions of each field can be found here: [Azure.Identity class - EnvironmentCredential Class](https://learn.microsoft.com/en-us/dotnet/api/azure.identity.environmentcredential?view=azure-dotnet#definition)

| Env Name       |  Description
| -------------- | -----------
| `AZURE_TENANT_ID`           | See the Tip mentioned above.
| `AZURE_CLIENT_ID`           |
| `AZURE_CLIENT_SECRET`       |
| `AZURE_CLIENT_CERTIFICATE_PATH`           |
| `AZURE_CLIENT_SEND_CERTIFICATE_CHAIN`           |
| `AZURE_USERNAME`            |
| `AZURE_PASSWORD`            |

`win.azureSignOptions` needs to be configured per [Microsoft's instructions](https://learn.microsoft.com/en-us/azure/trusted-signing/how-to-signing-integrations#create-a-json-file) directly in electron-builder's configuration. Additional fields can be provided that are passed directly to `Invoke-TrustedSigning` powershell command.
