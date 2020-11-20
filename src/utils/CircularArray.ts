import Constants from './Constants';

export default class CircularArray<T> extends Array<T> {
  public size: number;

  constructor(size: number = Constants.MAXIMUM_MEASUREMENTS_NUMBER) {
    super();
    this.size = size;
  }

  push(...items: T[]): number {
    while (this.length > this.size) {
      this.shift();
    }
    return super.push(...items);
  }

  unshift(...items: T[]): number {
    while (this.length > this.size) {
      this.pop();
    }
    return super.unshift(...items);
  }
}
