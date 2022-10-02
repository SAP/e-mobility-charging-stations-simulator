import {
  ProcedureName,
  type ProtocolRequestHandler,
  ProtocolVersion,
} from '../../../types/UIProtocol';
import type { AbstractUIServer } from '../AbstractUIServer';
import AbstractUIService from './AbstractUIService';

export default class UIService001 extends AbstractUIService {
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
