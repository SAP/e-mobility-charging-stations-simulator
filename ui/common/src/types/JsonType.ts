export type JsonObject = {
  [K in string]?: (JsonObject | JsonPrimitive)[] | JsonObject | JsonPrimitive
}

export type JsonPrimitive = boolean | null | number | string

export type JsonType = (JsonObject | JsonPrimitive)[] | JsonObject | JsonPrimitive
