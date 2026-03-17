export type JsonObject = {
  [key in string]?: (JsonObject | JsonPrimitive)[] | JsonObject | JsonPrimitive
}
export type JsonType = JsonObject | JsonPrimitive | JsonType[]
type JsonPrimitive = boolean | Date | null | number | string
