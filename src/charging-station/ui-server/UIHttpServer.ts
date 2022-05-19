import { IncomingMessage, Server } from 'http';
import { Protocol, ProtocolVersion } from '../../types/UIProtocol';

import { AbstractUIServer } from './AbstractUIServer';
import Configuration from '../../utils/Configuration';
import { ServerOptions } from '../../types/ConfigurationData';
import UIServiceFactory from './ui-services/UIServiceFactory';
import Utils from '../../utils/Utils';
import logger from '../../utils/Logger';

export default class UIHttpServer extends AbstractUIServer {
  public constructor(private options?: ServerOptions) {
    super();
    this.server = new Server();
  }

  public start(): void {
    (this.server as Server).listen(this.options ?? Configuration.getUIServer().options);
    this.server.on('connection', (): void => {});
  }

  public stop(): void {
    this.server.close();
  }

  public sendResponse(message: string): void {}

  public logPrefix(): string {
    return Utils.logPrefix(' UI WebSocket Server:');
  }
}
