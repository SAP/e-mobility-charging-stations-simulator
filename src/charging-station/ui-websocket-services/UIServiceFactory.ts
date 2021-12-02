import AbstractUIService from './AbstractUIService';
import { ProtocolVersion } from '../../types/UIProtocol';
import UIService001 from './UIService001';
import UIWebSocketServer from '../UIWebSocketServer';

export default class UIServiceFactory {
  private constructor() {
    // This is intentional
  }

  public static getUIServiceImplementation(version: ProtocolVersion, uiWebSocketServer: UIWebSocketServer): AbstractUIService | null {
    switch (version) {
      case ProtocolVersion['0.0.1']:
        return new UIService001(uiWebSocketServer);
      default:
        return null;
    }
  }
}
