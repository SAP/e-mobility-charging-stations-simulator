import type { AbstractUIService } from './AbstractUIService';
import { UIService001 } from './UIService001';
import { ProtocolVersion } from '../../../types';
import type { AbstractUIServer } from '../AbstractUIServer';

export class UIServiceFactory {
  private constructor() {
    // This is intentional
  }

  public static getUIServiceImplementation(
    version: ProtocolVersion,
    uiServer: AbstractUIServer,
  ): AbstractUIService {
    switch (version) {
      case ProtocolVersion['0.0.1']:
        return new UIService001(uiServer);
    }
  }
}
