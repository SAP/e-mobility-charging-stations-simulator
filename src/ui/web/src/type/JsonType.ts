export type JsonType = JsonPrimitive | JsonType[] | JsonObject;
export type JsonObject = { [key in string]?: JsonType };
export type JsonPrimitive = string | number | boolean | Date | null;
