type JsonPrimitive = boolean | Date | null | number | string

export type JsonObject = {
  [key in string]?: JsonType
}

export type JsonType = JsonObject | JsonPrimitive | JsonType[]
