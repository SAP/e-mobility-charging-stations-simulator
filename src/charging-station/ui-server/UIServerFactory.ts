import chalk from 'chalk'

import { BaseError } from '../../exception/index.js'
import {
  ApplicationProtocol,
  ApplicationProtocolVersion,
  AuthenticationType,
  ConfigurationSection,
  type UIServerConfiguration,
} from '../../types/index.js'
import { logger, logPrefix } from '../../utils/index.js'
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
        `Unknown authentication type '${uiServerConfiguration.authentication.type}' in '${ConfigurationSection.uiServer}' configuration section`
      )
    }
    if (
      uiServerConfiguration.type === ApplicationProtocol.HTTP &&
      uiServerConfiguration.authentication?.enabled === true &&
      uiServerConfiguration.authentication.type === AuthenticationType.PROTOCOL_BASIC_AUTH
    ) {
      throw new BaseError(
        `'${uiServerConfiguration.authentication.type}' authentication type with application protocol type '${uiServerConfiguration.type}' is not supported in '${ConfigurationSection.uiServer}' configuration section`
      )
    }
    if (
      uiServerConfiguration.authentication?.enabled !== true &&
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      !isLoopback(uiServerConfiguration.options!.host!)
    ) {
      const logMsg = `Non loopback address in '${ConfigurationSection.uiServer}' configuration section without authentication enabled. This is not recommended`
      logger.warn(`${UIServerFactory.logPrefix()} ${logMsg}`)
      console.warn(chalk.yellow(logMsg))
    }
    if (
      uiServerConfiguration.type === ApplicationProtocol.WS &&
      uiServerConfiguration.version !== ApplicationProtocolVersion.VERSION_11
    ) {
      const logMsg = `Only version ${ApplicationProtocolVersion.VERSION_11} with application protocol type '${uiServerConfiguration.type}' is supported in '${ConfigurationSection.uiServer}' configuration section. Falling back to version ${ApplicationProtocolVersion.VERSION_11}`
      logger.warn(`${UIServerFactory.logPrefix()} ${logMsg}`)
      console.warn(chalk.yellow(logMsg))
      uiServerConfiguration.version = ApplicationProtocolVersion.VERSION_11
    }
    switch (uiServerConfiguration.type) {
      case ApplicationProtocol.HTTP:
        return new UIHttpServer(uiServerConfiguration)
      case ApplicationProtocol.WS:
      default:
        if (
          !Object.values(ApplicationProtocol).includes(
            uiServerConfiguration.type as ApplicationProtocol
          )
        ) {
          // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
          const logMsg = `Unknown application protocol type '${uiServerConfiguration.type}' in '${
            ConfigurationSection.uiServer
            // eslint-disable-next-line @typescript-eslint/no-base-to-string
          }' configuration section from values '${ApplicationProtocol.toString()}', defaulting to '${
            ApplicationProtocol.WS
          }'`
          logger.warn(`${UIServerFactory.logPrefix()} ${logMsg}`)
          console.warn(logMsg)
        }
        return new UIWebSocketServer(uiServerConfiguration)
    }
  }

  private static readonly logPrefix = (modName?: string, methodName?: string): string => {
    const logMsgPrefix = 'UI Server'
    const logMsg =
      modName != null && methodName != null
        ? ` ${logMsgPrefix} | ${modName}.${methodName}:`
        : ` ${logMsgPrefix} |`
    return logPrefix(logMsg)
  }
}
