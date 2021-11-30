import AbstractUIService from './AbstractUIService';
import { ProtocolVersion } from '../../types/UIProtocol';
import UIService_0_0_1 from './UIService_0_0_1';
import UIWebSocketServer from '../UIWebSocketServer';

export default class UIServiceFactory {
  private constructor() {
    // This is intentional
  }

  public static getUIServiceImplementation(version: ProtocolVersion, uiWebSocketServer: UIWebSocketServer): AbstractUIService | null {
    switch (version) {
      case ProtocolVersion['0.0.1']:
        return new UIService_0_0_1(uiWebSocketServer);
      default:
        return null;
    }
  }
}
