export const getEnumStringValue = <T extends string>(
  enumObject: Readonly<Record<string, T>>,
  value: unknown
): T | undefined => {
  for (const key in enumObject) {
    if (Object.hasOwn(enumObject, key) && enumObject[key] === value) {
      return enumObject[key]
    }
  }
}
