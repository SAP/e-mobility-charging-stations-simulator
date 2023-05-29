/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { expect } from 'expect';

import { Queue } from '../../src/utils/Queue';

describe('Queue test suite', () => {
  it('Verify enqueue() behavior', () => {
    const queue = new Queue();
    let rtSize = queue.enqueue(1);
    expect(queue.size).toBe(1);
    expect(rtSize).toBe(queue.size);
    expect((queue as any).head).toBe(0);
    expect((queue as any).tail).toBe(1);
    expect((queue as any).items).toStrictEqual({ 0: 1 });
    rtSize = queue.enqueue(2);
    expect(queue.size).toBe(2);
    expect(rtSize).toBe(queue.size);
    expect((queue as any).head).toBe(0);
    expect((queue as any).tail).toBe(2);
    expect((queue as any).items).toStrictEqual({ 0: 1, 1: 2 });
    rtSize = queue.enqueue(3);
    expect(queue.size).toBe(3);
    expect(rtSize).toBe(queue.size);
    expect((queue as any).head).toBe(0);
    expect((queue as any).tail).toBe(3);
    expect((queue as any).items).toStrictEqual({ 0: 1, 1: 2, 2: 3 });
  });

  it('Verify dequeue() behavior', () => {
    const queue = new Queue();
    queue.enqueue(1);
    queue.enqueue(2);
    queue.enqueue(3);
    let rtItem = queue.dequeue();
    expect(queue.size).toBe(2);
    expect(rtItem).toBe(1);
    expect((queue as any).head).toBe(1);
    expect((queue as any).tail).toBe(3);
    expect((queue as any).items).toStrictEqual({ 1: 2, 2: 3 });
    rtItem = queue.dequeue();
    expect(queue.size).toBe(1);
    expect(rtItem).toBe(2);
    expect((queue as any).head).toBe(2);
    expect((queue as any).tail).toBe(3);
    expect((queue as any).items).toStrictEqual({ 2: 3 });
    rtItem = queue.dequeue();
    expect(queue.size).toBe(0);
    expect(rtItem).toBe(3);
    expect((queue as any).head).toBe(0);
    expect((queue as any).tail).toBe(0);
    expect((queue as any).items).toStrictEqual({});
  });
});
