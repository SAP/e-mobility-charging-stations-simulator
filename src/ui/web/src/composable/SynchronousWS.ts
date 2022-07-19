import { JsonArray } from '@/type/JsonType';
import { MessageCode, ProtocolMessage, ProtocolRequest } from '@/type/UIProtocol';

// let test = false;
export default class SynchronousWS {
  private _ws: WebSocket;
  private _msgId: number;
  private _toBeSent: Array<string>;
  private _messageHandler: Map<
    number,
    { resolve: (value: JsonArray | PromiseLike<JsonArray>) => void; reject: (reason?: any) => void }
  >;

  constructor(url: string | URL, protocols?: string | string[] | undefined) {
    this._ws = new WebSocket(url, protocols);
    this._msgId = 0;
    this._toBeSent = new Array<string>();
    this._messageHandler = new Map<
      number,
      {
        resolve: (value: JsonArray | PromiseLike<JsonArray>) => void;
        reject: (reason?: any) => void;
      }
    >();

    this._ws.onmessage = this.onMessage.bind(this);
    this._ws.onopen = this.onOpen.bind(this);
  }

  public send(payload: JsonArray): Promise<JsonArray> {
    return new Promise((resolve, reject) => {
      const msg = JSON.stringify([0, this._msgId, ...payload]);

      if (this._ws.readyState !== this._ws.OPEN /* || !test*/) {
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
    console.debug(this._toBeSent);
    if (this._toBeSent.length > 0) {
      this._toBeSent.forEach((value: string) => {
        this._ws.send(value);
      });
    }
    // setTimeout(() => {
    //   test = true;
    // }, 1000);
  }

  private onMessage(ev: MessageEvent<string>): void {
    const [code, ...payload] = JSON.parse(ev.data) as ProtocolMessage;

    switch (code) {
      case MessageCode.REQUEST:
        break;
      case MessageCode.ANSWER:
        this.answerHandler(payload);
        break;
      case MessageCode.ERROR:
        this.errorHandler(payload);
        break;
      default:
    }

    // const handler = this._messageHandler.get(message[0]);
    // handler?.resolve(message[1]);
  }

  private answerHandler(answer: ProtocolRequest): void {
    const [id, ...payload] = answer;

    const handler = this._messageHandler.get(id);
    if (typeof handler === 'undefined') throw 'unknown answer id';

    handler.resolve(payload as JsonArray);
  }

  private errorHandler(answer: ProtocolRequest): void {
    const [id, ...payload] = answer;

    const handler = this._messageHandler.get(id);
    if (typeof handler === 'undefined') throw 'unknown answer id';

    handler.reject('error lel'); //TODO
  }
}
