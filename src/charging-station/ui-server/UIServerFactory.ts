import { AbstractUIServer } from './AbstractUIServer';
import { ApplicationProtocol } from '../../types/UIProtocol';
import Configuration from '../../utils/Configuration';
import { ServerOptions } from '../../types/ConfigurationData';
import UIWebSocketServer from './UIWebSocketServer';

export default class UIServerFactory {
  private constructor() {
    // This is intentional
  }

  public static getUIServerImplementation(
    applicationProtocol: ApplicationProtocol,
    options?: ServerOptions
  ): AbstractUIServer | null {
    switch (applicationProtocol) {
      case ApplicationProtocol.WS:
        return new UIWebSocketServer(options ?? Configuration.getUIServer().options);
      default:
        return null;
    }
  }
}
