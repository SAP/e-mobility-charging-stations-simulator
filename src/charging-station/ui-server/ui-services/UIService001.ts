import { AbstractUIService } from './AbstractUIService';
import { type ProcedureName, type ProtocolRequestHandler, ProtocolVersion } from '../../../types';
import type { AbstractUIServer } from '../AbstractUIServer';

export class UIService001 extends AbstractUIService {
  constructor(uiServer: AbstractUIServer) {
    super(uiServer, ProtocolVersion['0.0.1']);
    for (const procedureName of Object.keys(
      AbstractUIService.ProcedureNameToBroadCastChannelProcedureNameMap
    ) as ProcedureName[]) {
      this.requestHandlers.set(
        procedureName,
        this.handleProtocolRequest.bind(this) as ProtocolRequestHandler
      );
    }
  }
}
