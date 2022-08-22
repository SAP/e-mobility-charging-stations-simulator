import { IncomingMessage } from 'http';

import { Protocol, ProtocolVersion } from '../../../types/UIProtocol';
import logger from '../../../utils/Logger';
import Utils from '../../../utils/Utils';

export class UIServiceUtils {
  private constructor() {
    // This is intentional
  }

  public static handleProtocols = (
    protocols: Set<string>,
    request: IncomingMessage
  ): string | false => {
    let protocolIndex: number;
    let protocol: Protocol;
    let version: ProtocolVersion;
    for (const fullProtocol of protocols) {
      protocolIndex = fullProtocol.indexOf(Protocol.UI);
      protocol = fullProtocol.substring(
        protocolIndex,
        protocolIndex + Protocol.UI.length
      ) as Protocol;
      version = fullProtocol.substring(protocolIndex + Protocol.UI.length) as ProtocolVersion;
      if (
        Object.values(Protocol).includes(protocol) &&
        Object.values(ProtocolVersion).includes(version)
      ) {
        return fullProtocol;
      }
    }
    logger.error(
      `${Utils.logPrefix(
        ' UI WebSocket Server |'
      )} Unsupported protocol: ${protocol} or protocol version: ${version}`
    );
    return false;
  };

  public static isLoopback(address: string): boolean {
    const isLoopbackRegExp = new RegExp(
      // eslint-disable-next-line no-useless-escape
      /^localhost$|^127(?:\.\d+){0,2}\.\d+$|^(?:0*\:)*?:?0*1$/,
      'i'
    );
    return isLoopbackRegExp.test(address);
  }
}
