/**
 * Extracts the value from a `<select>` element's change event.
 * @param event - The DOM change event from a `<select>` element
 * @returns The selected option's value
 */
export function getSelectValue (event: Event): string {
  return (event.target as HTMLSelectElement).value
}
