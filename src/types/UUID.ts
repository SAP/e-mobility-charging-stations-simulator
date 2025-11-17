/**
 * UUIDv4 type representing a standard UUID format
 * cspell:ignore yxxx
 * Pattern: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
 * where x is any hexadecimal digit and y is one of 8, 9, A, or B
 */
export type UUIDv4 = `${string}-${string}-${string}-${string}-${string}`
