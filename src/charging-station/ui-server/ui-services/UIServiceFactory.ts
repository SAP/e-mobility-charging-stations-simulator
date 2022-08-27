import { ProtocolVersion } from '../../../types/UIProtocol';
import type { AbstractUIServer } from '../AbstractUIServer';
import type AbstractUIService from './AbstractUIService';
import UIService001 from './UIService001';

export default class UIServiceFactory {
  private constructor() {
    // This is intentional
  }

  public static getUIServiceImplementation(
    version: ProtocolVersion,
    uiServer: AbstractUIServer
  ): AbstractUIService | null {
    switch (version) {
      case ProtocolVersion['0.0.1']:
        return new UIService001(uiServer);
      default:
        return null;
    }
  }
}
