import chalk from 'chalk';

import type { AbstractUIServer } from './AbstractUIServer';
import { UIHttpServer } from './UIHttpServer';
import { UIServerUtils } from './UIServerUtils';
import { UIWebSocketServer } from './UIWebSocketServer';
import {
  ApplicationProtocol,
  ApplicationProtocolVersion,
  type UIServerConfiguration,
} from '../../types';
import { isUndefined } from '../../utils';

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
    uiServerConfiguration = {
      ...(uiServerConfiguration.type === ApplicationProtocol.HTTP &&
        isUndefined(uiServerConfiguration.version) && {
          version: ApplicationProtocolVersion.VERSION_11,
        }),
      ...uiServerConfiguration,
    };
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
