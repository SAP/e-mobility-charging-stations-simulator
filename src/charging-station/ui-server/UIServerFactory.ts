import chalk from 'chalk';

import type { AbstractUIServer } from './AbstractUIServer';
import { UIHttpServer } from './UIHttpServer';
import { UIServerUtils } from './UIServerUtils';
import { UIWebSocketServer } from './UIWebSocketServer';
import { ApplicationProtocol, type UIServerConfiguration } from '../../types';

export class UIServerFactory {
  private constructor() {
    // This is intentional
  }

  public static getUIServerImplementation(
    uiServerConfiguration: UIServerConfiguration,
  ): AbstractUIServer | null {
    if (UIServerUtils.isLoopback(uiServerConfiguration.options!.host!) === false) {
      console.warn(
        chalk.yellow(
          'Loopback address not detected in UI server configuration. This is not recommended.',
        ),
      );
    }
    switch (uiServerConfiguration.type) {
      case ApplicationProtocol.WS:
        return new UIWebSocketServer(uiServerConfiguration);
      case ApplicationProtocol.HTTP:
        return new UIHttpServer(uiServerConfiguration);
      default:
        return null;
    }
  }
}
