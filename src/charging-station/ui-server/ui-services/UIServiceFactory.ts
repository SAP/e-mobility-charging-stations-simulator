import type { AbstractUIServer } from '../AbstractUIServer.js'
import type { AbstractUIService } from './AbstractUIService.js'

import { ProtocolVersion } from '../../../types/index.js'
import { UIService001 } from './UIService001.js'

// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class UIServiceFactory {
  private constructor () {
    // This is intentional
  }

  public static getUIServiceImplementation (
    version: ProtocolVersion,
    uiServer: AbstractUIServer
  ): AbstractUIService {
    switch (version) {
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      case ProtocolVersion['0.0.1']:
        return new UIService001(uiServer)
    }
  }
}
