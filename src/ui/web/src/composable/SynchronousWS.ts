import { JsonType } from '@/type/JsonType';

type Message = [number, JsonType];

export default class SynchronousWS {
  private _ws: WebSocket;
  private _messageHandler: Map<
    number,
    { resolve: (value: JsonType | PromiseLike<JsonType>) => void; reject: (reason?: any) => void }
  >;
  private _msgId: number;
  private _toBeSent: Array<string>;

  constructor(url: string | URL, protocols?: string | string[] | undefined) {
    this._ws = new WebSocket(url, protocols);
    this._messageHandler = new Map<
      number,
      { resolve: (value: JsonType | PromiseLike<JsonType>) => void; reject: (reason?: any) => void }
    >();
    this._msgId = 0;
    this._toBeSent = new Array<string>();

    this._ws.onmessage = this.onMessage.bind(this);
    this._ws.onopen = this.onOpen.bind(this);
  }

  public send(payload: JsonType): Promise<JsonType> {
    return new Promise((resolve, reject) => {
      const msg = JSON.stringify([this._msgId, payload]);
      if (this._ws.readyState !== this._ws.OPEN) {
        this._toBeSent.push(msg);
      } else {
        console.debug('send:', msg);
        this._ws.send(msg);
      }
      this._messageHandler.set(this._msgId, { resolve, reject });
      ++this._msgId;
    });
  }

  private onOpen(ev: Event): void {
    console.debug('open');
    if (this._toBeSent.length > 0) {
      this._toBeSent.forEach((value: string) => {
        this._ws.send(value);
      });
    }
  }

  private onMessage(ev: MessageEvent<string>): void {
    const message = JSON.parse(ev.data) as Message;
    const handler = this._messageHandler.get(message[0]);
    handler?.resolve(message[1]);
  }
}
