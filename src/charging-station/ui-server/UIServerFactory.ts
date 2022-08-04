import chalk from 'chalk';

import { ServerOptions } from '../../types/ConfigurationData';
import { ApplicationProtocol } from '../../types/UIProtocol';
import Configuration from '../../utils/Configuration';
import { AbstractUIServer } from './AbstractUIServer';
import { UIServiceUtils } from './ui-services/UIServiceUtils';
import UIWebSocketServer from './UIWebSocketServer';

export default class UIServerFactory {
  private constructor() {
    // This is intentional
  }

  public static getUIServerImplementation(
    applicationProtocol: ApplicationProtocol,
    options?: ServerOptions
  ): AbstractUIServer | null {
    if (!UIServiceUtils.isLoopback(options?.host)) {
      console.warn(
        chalk.magenta(
          'Loopback address not detected in UI server configuration. This is not recommended.'
        )
      );
    }
    switch (applicationProtocol) {
      case ApplicationProtocol.WS:
        return new UIWebSocketServer(options ?? Configuration.getUIServer().options);
      default:
        return null;
    }
  }
}
