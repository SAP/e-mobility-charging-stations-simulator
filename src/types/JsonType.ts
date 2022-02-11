type JsonArray = Array<JsonValue>;

type JsonValue = string | number | boolean | Date | JsonType | JsonArray;

export interface JsonType {
  [key: string]: JsonValue;
}
