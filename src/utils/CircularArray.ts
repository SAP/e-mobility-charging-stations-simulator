
export default class CircularArray<T> extends Array<T> {
  size: number;
  private readonly maximumCircularArraySize = 2000;

  constructor(size?: number) {
    super();
    this.size = size && size <= this.maximumCircularArraySize ? size : this.maximumCircularArraySize;
  }

  push(...items: T[]): number {
    if (this.length + items.length > this.size) {
      super.splice(0, (this.length + items.length) - this.size);
    }
    return super.push(...items);
  }

  unshift(...items: T[]): number {
    if (this.length + items.length > this.size) {
      super.splice(this.size - items.length, (this.length + items.length) - this.size);
    }
    return super.unshift(...items);
  }

  concat(...items: (T | ConcatArray<T>)[]): T[] {
    if (this.length + items.length > this.size) {
      super.splice(0, (this.length + items.length) - this.size);
    }
    return super.concat(items as T[]);
  }

  splice(start: number, deleteCount?: number, ...items: T[]): T[] {
    this.push(...items);
    return super.splice(start, deleteCount);
  }
}
