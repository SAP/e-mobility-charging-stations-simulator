type JsonArray = Array<JsonValue>;

export type JsonValue = string | number | boolean | Date | JsonType | JsonArray;

export type JsonType = {
  [key in string]: JsonValue;
};
