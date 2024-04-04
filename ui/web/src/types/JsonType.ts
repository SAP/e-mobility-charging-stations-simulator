type JsonPrimitive = string | number | boolean | Date | null
export type JsonObject = { [key in string]?: JsonType }
export type JsonType = JsonPrimitive | JsonType[] | JsonObject
