import chalk from 'chalk'

import type { AbstractUIServer } from './AbstractUIServer.js'
import { UIHttpServer } from './UIHttpServer.js'
import { UIServerUtils } from './UIServerUtils.js'
import { UIWebSocketServer } from './UIWebSocketServer.js'
import {
  ApplicationProtocol,
  ApplicationProtocolVersion,
  type UIServerConfiguration
} from '../../types/index.js'

// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class UIServerFactory {
  private constructor () {
    // This is intentional
  }

  public static getUIServerImplementation (
    uiServerConfiguration: UIServerConfiguration
  ): AbstractUIServer | undefined {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    if (!UIServerUtils.isLoopback(uiServerConfiguration.options!.host!)) {
      console.warn(
        chalk.yellow(
          'Loopback address not detected in UI server configuration. This is not recommended'
        )
      )
    }
    uiServerConfiguration = {
      version: ApplicationProtocolVersion.VERSION_11,
      ...uiServerConfiguration
    }
    if (
      uiServerConfiguration.type === ApplicationProtocol.WS &&
      uiServerConfiguration.version !== ApplicationProtocolVersion.VERSION_11
    ) {
      console.warn(
        chalk.yellow(
          `Only version ${ApplicationProtocolVersion.VERSION_11} is supported for WebSocket UI server. Falling back to version ${ApplicationProtocolVersion.VERSION_11}`
        )
      )
      uiServerConfiguration.version = ApplicationProtocolVersion.VERSION_11
    }
    switch (uiServerConfiguration.type) {
      case ApplicationProtocol.WS:
        return new UIWebSocketServer(uiServerConfiguration)
      case ApplicationProtocol.HTTP:
        return new UIHttpServer(uiServerConfiguration)
    }
  }
}
