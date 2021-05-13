
export default class CircularArray<T> extends Array<T> {
  public size: number;
  private readonly defaultCircularArraySize = 2000;

  constructor(size?: number) {
    super();
    this.size = size ?? this.defaultCircularArraySize;
  }

  public push(...items: T[]): number {
    if (this.length + items.length > this.size) {
      super.splice(0, (this.length + items.length) - this.size);
    }
    return super.push(...items);
  }

  public unshift(...items: T[]): number {
    if (this.length + items.length > this.size) {
      super.splice(this.size - items.length, (this.length + items.length) - this.size);
    }
    return super.unshift(...items);
  }

  public concat(...items: (T | ConcatArray<T>)[]): T[] {
    if (this.length + items.length > this.size) {
      super.splice(0, (this.length + items.length) - this.size);
    }
    return super.concat(items as T[]);
  }

  public splice(start: number, deleteCount?: number, ...items: T[]): T[] {
    this.push(...items);
    return super.splice(start, deleteCount);
  }

  public resize(size: number): void {
    if (size < 0) {
      throw new RangeError(
        'circular array size does not allow negative values.'
      );
    }
    if (size === 0) {
      this.length = 0;
    } else if (size !== this.size) {
      this.slice(-size);
    }
    this.size = size;
  }

  public empty(): boolean {
    return this.length === 0;
  }

  public full(): boolean {
    return this.length === this.size;
  }
}
