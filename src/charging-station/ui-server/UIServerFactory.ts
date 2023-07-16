import chalk from 'chalk';

import type { AbstractUIServer } from './AbstractUIServer';
import { UIHttpServer } from './UIHttpServer';
import { UIServerUtils } from './UIServerUtils';
import { UIWebSocketServer } from './UIWebSocketServer';
import { ApplicationProtocol, type UIServerConfiguration } from '../../types';
import { Configuration } from '../../utils';

export class UIServerFactory {
  private constructor() {
    // This is intentional
  }

  public static getUIServerImplementation(
    uiServerConfiguration?: UIServerConfiguration,
  ): AbstractUIServer | null {
    if (UIServerUtils.isLoopback(uiServerConfiguration!.options!.host!) === false) {
      console.warn(
        chalk.yellow(
          'Loopback address not detected in UI server configuration. This is not recommended.',
        ),
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
