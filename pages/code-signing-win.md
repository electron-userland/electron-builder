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

## Using Azure Trusted Signing (beta)

Microsoft itself offers a code signing service called Azure Trusted Signing which you can use to code-sign your applications.

If you do not already have an Azure setup and only want to use their code signing service, set up an Azure "Trusted Signing Account" using [this quickstart guide](https://learn.microsoft.com/en-us/azure/trusted-signing/quickstart). Then, [set up an "App registration"](https://learn.microsoft.com/en-us/entra/identity-platform/quickstart-register-app) in Azure, follow the steps to create a "Secret" for it, and [assign the role "Trusted Signing Certificate Profile Signer" to the App registration](https://learn.microsoft.com/en-us/azure/trusted-signing/tutorial-assign-roles).

To sign using your certificate, you'll need to adapt electron-builder's configuration and set the environment variables used for authentication. The environment variables are read directly by the `Invoke-TrustedSigning` module; they are not parsed or resolved by electron-builder.

First, to direct electron-builder to utilize Azure Trusted Signing, you'll need to set the property `win.azureSignOptions` in your electron-builder configuration. Configure it per [Microsoft's instructions](https://learn.microsoft.com/en-us/azure/trusted-signing/how-to-signing-integrations#create-a-json-file).

| Property                 | Description                                                                                                         |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| `publisherName`          | This must match exactly the CommonName (CN) property of the certificate you wish to use.                            |
| `endpoint`               | This corresponds to the endpoint you selected when creating your certificate.                                       |
| `certificateProfileName` | The name of the certificate profile within your Trusted Signing Account.                                            |
| `codeSigningAccountName` | This is the name of the Trusted Signing Account (note that it is **not** the account name for the app registration. |

Additional fields can be provided under `win.azureSignOptions` that are passed directly to the `Invoke-TrustedSigning` powershell module.

Second, provide the appropriate environment variables to the build action. Descriptions of each variable can be found in [Azure.Identity class - EnvironmentCredential Class](https://learn.microsoft.com/en-us/dotnet/api/azure.identity.environmentcredential?view=azure-dotnet#definition). You only need to provide the environment variables that are listed in the table corresponding to which authentication method you choose to use.

!!! tip
  If you use the minimal setup using an "App registration" that is described above, the section "Service principal with secret" applies to you. In this case, you only need the Tenant ID, Client ID, and Client Secret.

| Env Name                              |  Description                                                                                            |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `AZURE_TENANT_ID`                     | Your Azure AD Tenant ID; can be found in the Entra ID portal.                                           |
| `AZURE_CLIENT_ID`                     | The Application (Client) ID of your "App registration." Note that this is not the "object" ID.          |
| `AZURE_CLIENT_SECRET`                 | The value of the "Secret" you created for your App registration. Note that this is not the secret's ID. |
| `AZURE_CLIENT_CERTIFICATE_PATH`       | Required if you bring your own certificate.                                                             |
| `AZURE_CLIENT_SEND_CERTIFICATE_CHAIN` | Required if you bring your own certificate.                                                             |
| `AZURE_USERNAME`                      | The username for your Microsoft Entra account.                                                          |
| `AZURE_PASSWORD`                      | The password for your Microsoft Entra account.                                                          |
