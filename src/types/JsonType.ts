export interface JsonType {
  [x: string]: string | number | boolean | Date | JsonType | JsonArray;
}

type JsonArray = Array<string | number | boolean | Date | JsonType | JsonArray>;
