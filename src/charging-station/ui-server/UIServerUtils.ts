import type { IncomingMessage } from 'http';

import { Protocol, ProtocolVersion } from '../../types/UIProtocol';
import logger from '../../utils/Logger';
import Utils from '../../utils/Utils';

export class UIServerUtils {
  private constructor() {
    // This is intentional
  }

  public static handleProtocols = (
    protocols: Set<string>,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    request: IncomingMessage
  ): string | false => {
    let protocol: Protocol;
    let version: ProtocolVersion;
    if (protocols.size === 0) {
      return false;
    }
    for (const fullProtocol of protocols) {
      if (UIServerUtils.isProtocolAndVersionSupported(fullProtocol) === true) {
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

  public static isProtocolAndVersionSupported = (protocolStr: string): boolean => {
    const [protocol, version] = UIServerUtils.getProtocolAndVersion(protocolStr);
    return (
      Object.values(Protocol).includes(protocol) === true &&
      Object.values(ProtocolVersion).includes(version) === true
    );
  };

  public static getProtocolAndVersion = (protocolStr: string): [Protocol, ProtocolVersion] => {
    const protocolIndex = protocolStr.indexOf(Protocol.UI);
    const protocol = protocolStr.substring(
      protocolIndex,
      protocolIndex + Protocol.UI.length
    ) as Protocol;
    const version = protocolStr.substring(protocolIndex + Protocol.UI.length) as ProtocolVersion;
    return [protocol, version];
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
