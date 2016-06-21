declare module "update-notifier" {
  interface NotifyOptionsPackage {
    name: string
    version: string
  }

  interface NotifyOptions {
    pkg: NotifyOptionsPackage
  }

  interface Notifier {
    notify(): void
  }

  function updateNotifier(options: NotifyOptions): Notifier

  export = updateNotifier
}