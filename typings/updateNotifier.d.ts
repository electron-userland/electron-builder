declare module "update-notifier" {
  interface NotifyOptionsPackage {
    name: string
    version: string
  }

  interface NotifyOptions {
    pkg: NotifyOptionsPackage
  }

  interface Notifier {
    notify(options: any): void

    update: any
  }

  function updateNotifier(options: NotifyOptions): Notifier

  export = updateNotifier
}