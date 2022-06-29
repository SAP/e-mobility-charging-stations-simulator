import { ref, Ref } from 'vue';
import config from '@/assets/config';
import { JsonArray, JsonType } from '@/type/JsonType';
import { ProtocolCommand } from '@/../../../types/UIProtocol';

export default class EMobility {
  private static _instance: EMobility | null = null;
  private _chargingStations: Ref<Record<string, unknown>[]>;
  private _socket: WebSocket;
  private _isWaiting: Ref<boolean>;

  private constructor() {
    this._chargingStations = ref<Record<string, unknown>[]>([]);
    this._isWaiting = ref(false);

    this._socket = new WebSocket(
      `ws://${config.emobility.host}:${config.emobility.port}`,
      config.emobility.protocol
    );

    this._socket.onopen = EMobility.onOpen;
    this._socket.onmessage = EMobility.onMessage;
    this._socket.onclose = EMobility.onClose;
    this._socket.onerror = EMobility.onError;
  }

  public static get Instance() {
    return EMobility._instance || (EMobility._instance = new EMobility());
  }

  public static get chargingStations() {
    return EMobility.Instance._chargingStations;
  }

  public static get isWaiting() {
    return EMobility.Instance._isWaiting;
  }

  public static get isWaitingValue() {
    return EMobility.Instance._isWaiting.value;
  }

  public static set isWaitingValue(bit: boolean) {
    EMobility.Instance._isWaiting.value = bit;
  }

  private static onOpen(ev: Event): void {
    console.log('socket open');
    // EMobility.listChargingStations();
  }

  private static onMessage(message: MessageEvent<string>): void {
    // console.log(message);

    const data = JSON.parse(message.data) as JsonArray;

    switch (data[0]) {
      case ProtocolCommand.LIST_CHARGING_STATIONS:
        EMobility.Instance._chargingStations.value =
          EMobility.Instance._chargingStations.value.concat(
            EMobility.Instance._chargingStations.value.concat(data[1] as Record<string, unknown>[])
          );
        EMobility.isWaitingValue = false;
        break;
      default:
        console.error('error');
    }
  }

  private static onClose(ev: CloseEvent): void {
    console.log('socket closed');
  }

  private static onError(ev: Event): void {
    console.error(ev);
  }

  public static listChargingStations(): void {
    EMobility.isWaitingValue = true;
    try {
      EMobility.send([ProtocolCommand.LIST_CHARGING_STATIONS, {}]);
    } catch (error: unknown) {
      console.error(error);
      EMobility.isWaitingValue = false;
    }
  }

  private static send(data: JsonType): void {
    if (EMobility.Instance._socket.readyState != EMobility.Instance._socket.OPEN) {
      throw `socket not open: ${data}`;
    }
    try {
      EMobility.Instance._socket.send(JSON.stringify(data));
    } catch (error: unknown) {
      console.error(error);
    }
  }
}
