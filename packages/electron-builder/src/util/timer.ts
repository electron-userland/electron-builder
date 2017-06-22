import { debug } from "electron-builder-util"

export interface Timer {
  end(): void
}

class DevTimer implements Timer {
  constructor(private readonly label: string) {
    console.time(label)
  }

  end(): void {
    console.timeEnd(this.label)
  }
}

class ProductionTimer implements Timer {
  end(): void {
  }
}

export function time(label: string): Timer {
  return debug.enabled ? new DevTimer(label) : new ProductionTimer()
}