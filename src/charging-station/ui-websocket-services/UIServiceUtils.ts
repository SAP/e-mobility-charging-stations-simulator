import { Protocol, ProtocolVersion } from '../../types/UiProtocol';

import { IncomingMessage } from 'http';
import Utils from '../../utils/Utils';
import logger from '../../utils/Logger';

export class UIServiceUtils {
  public static handleProtocols = (protocols: Set<string>, request: IncomingMessage): string | false => {
    let protocolIndex: number;
    let protocol: Protocol;
    let version: ProtocolVersion;
    for (const fullProtocol of protocols) {
      protocolIndex = fullProtocol.indexOf(Protocol.UI);
      protocol = fullProtocol.substring(protocolIndex, protocolIndex + Protocol.UI.length) as Protocol;
      version = fullProtocol.substring(protocolIndex + Protocol.UI.length) as ProtocolVersion;
      if (Object.values(Protocol).includes(protocol) && Object.values(ProtocolVersion).includes(version)) {
        return fullProtocol;
      }
    }
    logger.error(`${Utils.logPrefix(' UI WebSocket Server:')} Unsupported protocol: ${protocol} or protocol version: ${version}`);
    return false;
  };
}
