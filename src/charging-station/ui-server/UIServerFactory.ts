import chalk from 'chalk';

import { ApplicationProtocol, type UIServerConfiguration } from '../../types';
import { Configuration } from '../../utils/Configuration';
import { type AbstractUIServer, UIHttpServer, UIServerUtils, UIWebSocketServer } from '../internal';

export class UIServerFactory {
  private constructor() {
    // This is intentional
  }

  public static getUIServerImplementation(
    uiServerConfiguration?: UIServerConfiguration
  ): AbstractUIServer | null {
    if (UIServerUtils.isLoopback(uiServerConfiguration.options?.host) === false) {
      console.warn(
        chalk.yellow(
          'Loopback address not detected in UI server configuration. This is not recommended.'
        )
      );
    }
    switch (uiServerConfiguration?.type ?? Configuration.getUIServer().type) {
      case ApplicationProtocol.WS:
        return new UIWebSocketServer(uiServerConfiguration ?? Configuration.getUIServer());
      case ApplicationProtocol.HTTP:
        return new UIHttpServer(uiServerConfiguration ?? Configuration.getUIServer());
      default:
        return null;
    }
  }
}
