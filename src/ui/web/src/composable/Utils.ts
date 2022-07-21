export default class Utils {
  public static isUndefined(value: unknown): boolean {
    return typeof value === 'undefined';
  }

  public static ifUndefined<T>(value: T | undefined, elseValue: T): T {
    if (Utils.isUndefined(value)) return elseValue;
    return value as T;
  }
}
