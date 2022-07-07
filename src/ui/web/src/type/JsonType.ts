export type JsonType = JsonPrimitive | JsonArray | JsonObject;
export type JsonObject = { [Key in string]?: JsonType };
export type JsonArray = Array<JsonType>;
export type JsonPrimitive = string | number | boolean | Date | null;
