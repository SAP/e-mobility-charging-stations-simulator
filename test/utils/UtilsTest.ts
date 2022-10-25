import expect from 'expect';

import Utils from '../../src/utils/Utils';

describe('Utils test suite', () => {
  it('Verify secureRandom()', () => {
    const random = Utils.secureRandom();
    expect(typeof random === 'number').toBe(true);
    expect(random).toBeGreaterThanOrEqual(0);
    expect(random).toBeLessThan(1);
  });

  it('Verify getRandomInteger()', () => {
    const randomInteger = Utils.getRandomInteger();
    expect(Number.isSafeInteger(randomInteger)).toBe(true);
    expect(randomInteger).toBeGreaterThanOrEqual(0);
    expect(randomInteger).toBeLessThanOrEqual(Number.MAX_SAFE_INTEGER);
    expect(() => Utils.getRandomInteger(0, 1)).toThrowError(new RangeError('Invalid interval'));
    expect(() => Utils.getRandomInteger(-1)).toThrowError(new RangeError('Invalid interval'));
    expect(() => Utils.getRandomInteger(0, -1)).toThrowError(new RangeError('Invalid interval'));
  });

  it('Verify getRandomFloat()', () => {
    const randomFloat = Utils.getRandomFloat();
    expect(typeof randomFloat === 'number').toBe(true);
    expect(randomFloat).toBeGreaterThanOrEqual(0);
    expect(randomFloat).toBeLessThanOrEqual(Number.MAX_VALUE);
    expect(() => Utils.getRandomFloat(0, 1)).toThrowError(new RangeError('Invalid interval'));
    expect(() => Utils.getRandomFloat(-1)).toThrowError(new RangeError('Invalid interval'));
    expect(() => Utils.getRandomFloat(0, -1)).toThrowError(new RangeError('Invalid interval'));
  });

  it('Verify isIterable()', () => {
    expect(Utils.isIterable('')).toBe(false);
    expect(Utils.isIterable(' ')).toBe(true);
    expect(Utils.isIterable('test')).toBe(true);
    expect(Utils.isIterable(null)).toBe(false);
    expect(Utils.isIterable(undefined)).toBe(false);
    expect(Utils.isIterable(0)).toBe(false);
    expect(Utils.isIterable({})).toBe(false);
    expect(Utils.isIterable({ 1: 1 })).toBe(false);
    expect(Utils.isIterable([])).toBe(true);
    expect(Utils.isIterable(new Map())).toBe(true);
    expect(Utils.isIterable(new Set())).toBe(true);
  });

  it('Verify isEmptyString()', () => {
    expect(Utils.isEmptyString('')).toBe(true);
    expect(Utils.isEmptyString(' ')).toBe(true);
    expect(Utils.isEmptyString('     ')).toBe(true);
    expect(Utils.isEmptyString('test')).toBe(false);
    expect(Utils.isEmptyString(' test')).toBe(false);
    expect(Utils.isEmptyString('test ')).toBe(false);
    expect(Utils.isEmptyString(null)).toBe(false);
    expect(Utils.isEmptyString(undefined)).toBe(false);
    expect(Utils.isEmptyString(0)).toBe(false);
    expect(Utils.isEmptyString({})).toBe(false);
    expect(Utils.isEmptyString([])).toBe(false);
    expect(Utils.isEmptyString(new Map())).toBe(false);
    expect(Utils.isEmptyString(new Set())).toBe(false);
  });

  it('Verify isNullOrUndefined()', () => {
    expect(Utils.isNullOrUndefined(null)).toBe(true);
    expect(Utils.isNullOrUndefined(undefined)).toBe(true);
    expect(Utils.isNullOrUndefined('')).toBe(false);
    expect(Utils.isNullOrUndefined(0)).toBe(false);
    expect(Utils.isNullOrUndefined({})).toBe(false);
    expect(Utils.isNullOrUndefined([])).toBe(false);
    expect(Utils.isNullOrUndefined(new Map())).toBe(false);
    expect(Utils.isNullOrUndefined(new Set())).toBe(false);
  });

  it('Verify isEmptyArray()', () => {
    expect(Utils.isEmptyArray([])).toBe(true);
    expect(Utils.isEmptyArray([1, 2])).toBe(false);
    expect(Utils.isEmptyArray(null)).toBe(false);
    expect(Utils.isEmptyArray(undefined)).toBe(false);
    expect(Utils.isEmptyArray('')).toBe(false);
    expect(Utils.isEmptyArray(0)).toBe(false);
    expect(Utils.isEmptyArray({})).toBe(false);
    expect(Utils.isEmptyArray(new Map())).toBe(false);
    expect(Utils.isEmptyArray(new Set())).toBe(false);
  });

  it('Verify isEmptyObject()', () => {
    expect(Utils.isEmptyObject({})).toBe(true);
    expect(Utils.isEmptyObject(null)).toBe(false);
    expect(Utils.isEmptyObject(undefined)).toBe(false);
    expect(Utils.isEmptyObject(new Map())).toBe(false);
    expect(Utils.isEmptyObject(new Set())).toBe(false);
    expect(Utils.isEmptyObject({ 1: 1, 2: 2 })).toBe(false);
  });
});
