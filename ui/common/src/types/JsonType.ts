export type JsonObject = { [K in string]?: JsonType }

export type JsonPrimitive = boolean | null | number | string

export type JsonType = JsonObject | JsonPrimitive | JsonType[]
