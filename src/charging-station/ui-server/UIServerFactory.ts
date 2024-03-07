import chalk from 'chalk'

import { BaseError } from '../../exception/index.js'
import {
  ApplicationProtocol,
  ApplicationProtocolVersion,
  AuthenticationType,
  type UIServerConfiguration
} from '../../types/index.js'
import type { AbstractUIServer } from './AbstractUIServer.js'
import { UIHttpServer } from './UIHttpServer.js'
import { isLoopback } from './UIServerUtils.js'
import { UIWebSocketServer } from './UIWebSocketServer.js'

// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class UIServerFactory {
  private constructor () {
    // This is intentional
  }

  public static getUIServerImplementation (
    uiServerConfiguration: UIServerConfiguration
  ): AbstractUIServer {
    if (
      uiServerConfiguration.authentication?.enabled === true &&
      !Object.values(AuthenticationType).includes(uiServerConfiguration.authentication.type)
    ) {
      throw new BaseError(
        `Unknown authentication type '${uiServerConfiguration.authentication.type}' for UI server`
      )
    }
    if (
      uiServerConfiguration.type === ApplicationProtocol.HTTP &&
      uiServerConfiguration.authentication?.enabled === true &&
      uiServerConfiguration.authentication.type === AuthenticationType.PROTOCOL_BASIC_AUTH
    ) {
      throw new BaseError('Protocol basic authentication is not supported for HTTP UI server')
    }
    if (
      uiServerConfiguration.authentication?.enabled !== true &&
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      !isLoopback(uiServerConfiguration.options!.host!)
    ) {
      console.warn(
        chalk.yellow(
          'Non loopback address in UI server configuration without authentication enabled. This is not recommended'
        )
      )
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
      case ApplicationProtocol.HTTP:
        return new UIHttpServer(uiServerConfiguration)
      case ApplicationProtocol.WS:
      default:
        return new UIWebSocketServer(uiServerConfiguration)
    }
  }
}
