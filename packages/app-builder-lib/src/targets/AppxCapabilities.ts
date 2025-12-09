export interface Capability {

  readonly nsAlias:string|null

  /**
   * see https://learn.microsoft.com/en-us/uwp/schemas/appxpackage/uapmanifestschema/element-capabilities
   */
  readonly nsURI:string|null

  readonly name:string

  toXMLString():string
}

abstract class BaseCapability implements Capability{

  protected constructor(public readonly nsAlias:string | null,
                        public readonly nsURI:string | null,
                        protected readonly elementName:string,
                        public readonly name:string) {
  }

  toXMLString(){
    if(this.nsAlias)
      return `<${this.nsAlias}:${this.elementName} Name="${this.name}"/>`;
    return `<${this.elementName} Name="${this.name}"/>`;
  }
}

abstract class NSBaseCapability extends BaseCapability{

  protected constructor(nsAlias:string|null, nsURI:string, elementName:string, name:string) {
    super(nsAlias, nsURI, elementName, name);
  }

}

abstract class FoundationCapability extends NSBaseCapability{

  protected constructor(elementName:string, name:string) {
    // http://schemas.microsoft.com/appx/manifest/foundation/windows10
    super(null, "http://schemas.microsoft.com/appx/manifest/foundation/windows10", elementName, name);
  }
}

class CommonCapability extends FoundationCapability{

  constructor(name:string) {
    super("Capability", name);
  }
}

/**
 * https://learn.microsoft.com/de-de/uwp/schemas/appxpackage/how-to-specify-device-capabilities-in-a-package-manifest
 */
class DeviceCapability extends FoundationCapability{

  constructor(name:string) {
    super("DeviceCapability", name);
  }
}



class UAPCapability extends NSBaseCapability{

  constructor(name:string) {
    super("uap", "http://schemas.microsoft.com/appx/manifest/uap/windows10", "Capability", name);
  }
}

class UAP6Capability extends NSBaseCapability{

  constructor(name:string) {
    super("uap6", "http://schemas.microsoft.com/appx/manifest/uap/windows10/6", "Capability", name);
  }
}

class UAP7Capability extends NSBaseCapability{

  constructor(name:string) {
    super("uap7", "http://schemas.microsoft.com/appx/manifest/uap/windows10/7", "Capability", name);
  }
}

class UAP11Capability extends NSBaseCapability{

  constructor(name:string) {
    super("uap11", "http://schemas.microsoft.com/appx/manifest/uap/windows10/11", "Capability", name);
  }
}

class MobileCapability extends NSBaseCapability{

  constructor(name:string) {
    super("mobile", "http://schemas.microsoft.com/appx/manifest/mobile/windows10", "Capability", name);
  }
}

// class IOTCapability extends NSBaseCapability{
//
//   constructor(name:string) {
//     super('iot', '?????', 'Capability', name);
//   }
// }

class ResCapCapability extends NSBaseCapability{

  constructor(name:string) {
    super("rescap", "http://schemas.microsoft.com/appx/manifest/foundation/windows10/restrictedcapabilities", "Capability", name);
  }
}

// order matters
// see https://learn.microsoft.com/en-us/uwp/schemas/appxpackage/uapmanifestschema/element-capabilities

export const CAPABILITIES = [


  new CommonCapability("internetClient"),
  new CommonCapability("internetClientServer"),
  new CommonCapability("privateNetworkClientServer"),
  new CommonCapability("codeGeneration"), // ???
  new CommonCapability("allJoyn"), // ???
  new CommonCapability("backgroundMediaPlayback"),
  new CommonCapability("remoteSystem"),
  new CommonCapability("spatialPerception"),
  new CommonCapability("userDataTasks"),
  new CommonCapability("userNotificationListener"),


  new UAPCapability("musicLibrary"),
  new UAPCapability("picturesLibrary"),
  new UAPCapability("videosLibrary"),
  new UAPCapability("removableStorage"),
  new UAPCapability("appointments"),
  new UAPCapability("contacts"),
  new UAPCapability("phoneCall"),
  new UAPCapability("phoneCallHistoryPublic"),
  new UAPCapability("userAccountInformation"),
  new UAPCapability("voipCall"),
  new UAPCapability("objects3D"),
  new UAPCapability("chat"),
  new UAPCapability("blockedChatMessages"),

  new UAPCapability("enterpriseAuthentication"),
  new UAPCapability("sharedUserCertificates"),

  new UAPCapability("documentsLibrary"),



  new DeviceCapability("location"),
  new DeviceCapability("microphone"),
  new DeviceCapability("webcam"),

  new DeviceCapability("proximity"),

  // new DeviceCapability("usb"), // not supported, needs nested elements
  // new DeviceCapability("humaninterfacedevice"), // not supported, needs nested elements
  new DeviceCapability("pointOfService"),
  // new DeviceCapability("bluetooth"),  // not supported, needs nested elements
  new DeviceCapability("wiFiControl"),
  new DeviceCapability("radios"),
  new DeviceCapability("optical"),
  new DeviceCapability("activity"),
  new DeviceCapability("humanPresence"),
  new DeviceCapability("serialcommunication"),
  new DeviceCapability("gazeInput"),
  new DeviceCapability("lowLevel"),

  new DeviceCapability("packageQuery"), // correct namespace??


  new MobileCapability("recordedCallsFolder"),

  new ResCapCapability("enterpriseDataPolicy"),
  new ResCapCapability("appCaptureSettings"),
  new ResCapCapability("cellularDeviceControl"),
  new ResCapCapability("cellularDeviceIdentity"),
  new ResCapCapability("cellularMessaging"),
  new ResCapCapability("deviceUnlock"),
  new ResCapCapability("dualSimTiles"),
  new ResCapCapability("enterpriseDeviceLockdown"),
  new ResCapCapability("inputInjectionBrokered"),
  new ResCapCapability("inputObservation"),
  new ResCapCapability("inputSuppression"),
  new ResCapCapability("networkingVpnProvider"),
  new ResCapCapability("packageManagement"),
  new ResCapCapability("screenDuplication"),
  new ResCapCapability("userPrincipalName"),
  new ResCapCapability("walletSystem"),
  new ResCapCapability("locationHistory"),
  new ResCapCapability("confirmAppClose"),
  new ResCapCapability("phoneCallHistory"),
  new ResCapCapability("appointmentsSystem"),
  new ResCapCapability("chatSystem"),
  new ResCapCapability("contactsSystem"),
  new ResCapCapability("email"),
  new ResCapCapability("emailSystem"),
  new ResCapCapability("phoneCallHistorySystem"),
  new ResCapCapability("smsSend"),
  new ResCapCapability("userDataSystem"),
  new ResCapCapability("previewStore"),
  new ResCapCapability("firstSignInSettings"),
  new ResCapCapability("teamEditionExperience"),
  new ResCapCapability("remotePassportAuthentication"),
  new ResCapCapability("previewUiComposition"),
  new ResCapCapability("secureAssessment"),
  new ResCapCapability("networkConnectionManagerProvisioning"),
  new ResCapCapability("networkDataPlanProvisioning"),
  new ResCapCapability("slapiQueryLicenseValue"),
  new ResCapCapability("extendedBackgroundTaskTime"),
  new ResCapCapability("extendedExecutionBackgroundAudio"),
  new ResCapCapability("extendedExecutionCritical"),
  new ResCapCapability("extendedExecutionUnconstrained"),
  new ResCapCapability("deviceManagementDmAccount"),
  new ResCapCapability("deviceManagementFoundation"),
  new ResCapCapability("deviceManagementWapSecurityPolicies"),
  new ResCapCapability("deviceManagementEmailAccount"),
  new ResCapCapability("packagePolicySystem"),
  new ResCapCapability("gameList"),
  new ResCapCapability("xboxAccessoryManagement"),
  new ResCapCapability("cortanaSpeechAccessory"),
  new ResCapCapability("accessoryManager"),
  new ResCapCapability("interopServices"),
  new ResCapCapability("inputForegroundObservation"),
  new ResCapCapability("oemDeployment"),
  new ResCapCapability("oemPublicDirectory"),
  new ResCapCapability("appLicensing"),
  new ResCapCapability("locationSystem"),
  new ResCapCapability("userDataAccountsProvider"),
  new ResCapCapability("previewPenWorkspace"), // correct namespace??
  new ResCapCapability("secondaryAuthenticationFactor"), // correct namespace??
  new ResCapCapability("storeLicenseManagement"), // correct namespace??
  new ResCapCapability("userSystemId"), // correct namespace??
  new ResCapCapability("targetedContent"), // correct namespace??
  new ResCapCapability("targetedContent"), // correct namespace??
  new ResCapCapability("uiAutomation"), // correct namespace??
  new ResCapCapability("gameBarServices"), // correct namespace??
  new ResCapCapability("appCaptureServices"), // correct namespace??
  new ResCapCapability("appBroadcastServices"), // correct namespace??
  new ResCapCapability("audioDeviceConfiguration"), // correct namespace??
  new ResCapCapability("backgroundMediaRecording"), // correct namespace??
  new ResCapCapability("previewInkWorkspace"), // correct namespace??
  new ResCapCapability("startScreenManagement"), // correct namespace??
  new ResCapCapability("cortanaPermissions"), // correct namespace??
  new ResCapCapability("allAppMods"), // correct namespace??
  new ResCapCapability("expandedResources"), // correct namespace??
  new ResCapCapability("protectedApp"), // correct namespace??
  new ResCapCapability("gameMonitor"), // correct namespace??
  new ResCapCapability("appDiagnostics"), // correct namespace??
  new ResCapCapability("devicePortalProvider"), // correct namespace??
  new ResCapCapability("enterpriseCloudSSO"), // correct namespace??
  new ResCapCapability("backgroundVoIP"), // correct namespace??
  new ResCapCapability("oneProcessVoIP"), // correct namespace??
  new ResCapCapability("developmentModeNetwork"), // correct namespace??
  new ResCapCapability("broadFileSystemAccess"), // correct namespace??
  new ResCapCapability("smbios"), // correct namespace??
  new ResCapCapability("runFullTrust"),
  new ResCapCapability("allowElevation"),
  new ResCapCapability("teamEditionDeviceCredential"),
  new ResCapCapability("teamEditionView"),
  new ResCapCapability("cameraProcessingExtension"),
  new ResCapCapability("networkDataUsageManagement"),
  new ResCapCapability("phoneLineTransportManagement"),
  new ResCapCapability("unvirtualizedResources"),
  new ResCapCapability("modifiableApp"),
  new ResCapCapability("packageWriteRedirectionCompatibilityShim"),
  new ResCapCapability("customInstallActions"),
  new ResCapCapability("packagedServices"),
  new ResCapCapability("localSystemServices"),
  new ResCapCapability("backgroundSpatialPerception"),
  new ResCapCapability("uiAccess"),

  new UAP6Capability("graphicsCapture"),

  new UAP7Capability("globalMediaControl"),

  new UAP11Capability("graphicsCaptureWithoutBorder"),
  new UAP11Capability("graphicsCaptureProgrammatic"),

];



