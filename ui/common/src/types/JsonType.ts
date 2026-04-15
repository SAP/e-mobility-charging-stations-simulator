export type JsonObject = {
  [K in string]?: (JsonObject | JsonPrimitive)[] | JsonObject | JsonPrimitive
}

export type JsonPrimitive = boolean | Date | null | number | string

export type JsonType = (JsonObject | JsonPrimitive)[] | JsonObject | JsonPrimitive
