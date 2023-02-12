import { ProtocolVersion } from '../../../types';
import { type AbstractUIServer, type AbstractUIService, UIService001 } from '../../internal';

export class UIServiceFactory {
  private constructor() {
    // This is intentional
  }

  public static getUIServiceImplementation(
    version: ProtocolVersion,
    uiServer: AbstractUIServer
  ): AbstractUIService {
    switch (version) {
      case ProtocolVersion['0.0.1']:
        return new UIService001(uiServer);
    }
  }
}
