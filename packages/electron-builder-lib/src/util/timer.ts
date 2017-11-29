import { debug } from "builder-util"

export interface Timer {
  end(): string
}

export class DevTimer implements Timer {
  private start = process.hrtime()

  constructor(private readonly label: string) {
  }

  end(): string {
    const end = process.hrtime(this.start)
    const result = `${end[0]}s ${Math.round(end[1] / 1000000)}ms`
    console.info(`${this.label}: ${result}`)
    return result
  }
}

class ProductionTimer implements Timer {
  end(): string {
    return ""
  }
}

export function time(label: string): Timer {
  return debug.enabled ? new DevTimer(label) : new ProductionTimer()
}