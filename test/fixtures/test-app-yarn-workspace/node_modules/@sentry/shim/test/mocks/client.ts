import { bindClient } from '../../src';

export class TestClient {
  public static instance?: TestClient;

  public constructor(public options: object) {
    TestClient.instance = this;
  }

  public mySecretPublicMethod(str: string): string {
    return `secret: ${str}`;
  }
}

export class TestClient2 {}

export function init(options: object): void {
  bindClient(new TestClient(options));
}
