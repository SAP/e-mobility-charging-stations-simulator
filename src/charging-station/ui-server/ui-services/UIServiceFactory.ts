import type { AbstractUIService } from './AbstractUIService.js';
import { UIService001 } from './UIService001.js';
import { ProtocolVersion } from '../../../types/index.js';
import type { AbstractUIServer } from '../AbstractUIServer.js';

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
