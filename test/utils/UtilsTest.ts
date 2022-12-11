import expect from 'expect';

import Utils from '../../src/utils/Utils';

describe('Utils test suite', () => {
  it('Verify generateUUID()/validateUUID()', () => {
    const uuid = Utils.generateUUID();
    expect(uuid).toBeDefined();
    expect(uuid.length).toEqual(36);
    expect(Utils.validateUUID(uuid)).toBe(true);
    expect(Utils.validateUUID('abcdef00-0000-4000-0000-000000000000')).toBe(true);
    expect(Utils.validateUUID('')).toBe(false);
    // Shall invalidate Nil UUID
    expect(Utils.validateUUID('00000000-0000-0000-0000-000000000000')).toBe(false);
    expect(Utils.validateUUID('987FBC9-4BED-3078-CF07A-9141BA07C9F3')).toBe(false);
  });

  it('Verify sleep()', async () => {
    const start = Date.now();
    await Utils.sleep(1000);
    const end = Date.now();
    expect(end - start).toBeGreaterThanOrEqual(1000);
  });

  it('Verify convertToDate()', () => {
    expect(Utils.convertToDate(undefined)).toBe(undefined);
    expect(Utils.convertToDate(null)).toBe(null);
    const invalidDate = Utils.convertToDate('');
    expect(invalidDate instanceof Date && !isNaN(invalidDate.getTime())).toBe(false);
    expect(Utils.convertToDate(0)).toStrictEqual(new Date('1970-01-01T00:00:00.000Z'));
    expect(Utils.convertToDate([])).toBe(null);
    expect(Utils.convertToDate({})).toBe(null);
    expect(Utils.convertToDate(new Map())).toBe(null);
    expect(Utils.convertToDate(new Set())).toBe(null);
    expect(Utils.convertToDate(new WeakMap())).toBe(null);
    expect(Utils.convertToDate(new WeakSet())).toBe(null);
    const dateStr = '2020-01-01T00:00:00.000Z';
    let date = Utils.convertToDate(dateStr);
    expect(date).toBeInstanceOf(Date);
    expect(date).toStrictEqual(new Date(dateStr));
    date = Utils.convertToDate(new Date(dateStr));
    expect(date).toBeInstanceOf(Date);
    expect(date).toStrictEqual(new Date(dateStr));
  });

  it('Verify convertToInt()', () => {
    expect(Utils.convertToInt(undefined)).toBe(0);
    expect(Utils.convertToInt(null)).toBe(0);
    expect(Utils.convertToInt(0)).toBe(0);
    const randomInteger = Utils.getRandomInteger();
    expect(Utils.convertToInt(randomInteger)).toEqual(randomInteger);
    expect(Utils.convertToInt('-1')).toBe(-1);
    expect(Utils.convertToInt('1')).toBe(1);
    expect(Utils.convertToInt('1.1')).toBe(1);
    expect(Utils.convertToInt('1.9')).toBe(1);
    expect(Utils.convertToInt('1.999')).toBe(1);
    expect(Utils.convertToInt(-1)).toBe(-1);
    expect(Utils.convertToInt(1)).toBe(1);
    expect(Utils.convertToInt(1.1)).toBe(1);
    expect(Utils.convertToInt(1.9)).toBe(1);
    expect(Utils.convertToInt(1.999)).toBe(1);
  });

  it('Verify convertToFloat()', () => {
    expect(Utils.convertToFloat(undefined)).toBe(0);
    expect(Utils.convertToFloat(null)).toBe(0);
    expect(Utils.convertToFloat(0)).toBe(0);
    const randomFloat = Utils.getRandomFloat();
    expect(Utils.convertToFloat(randomFloat)).toEqual(randomFloat);
    expect(Utils.convertToFloat('-1')).toBe(-1);
    expect(Utils.convertToFloat('1')).toBe(1);
    expect(Utils.convertToFloat('1.1')).toBe(1.1);
    expect(Utils.convertToFloat('1.9')).toBe(1.9);
    expect(Utils.convertToFloat('1.999')).toBe(1.999);
    expect(Utils.convertToFloat(-1)).toBe(-1);
    expect(Utils.convertToFloat(1)).toBe(1);
    expect(Utils.convertToFloat(1.1)).toBe(1.1);
    expect(Utils.convertToFloat(1.9)).toBe(1.9);
    expect(Utils.convertToFloat(1.999)).toBe(1.999);
  });

  it('Verify convertToBoolean()', () => {
    expect(Utils.convertToBoolean(undefined)).toBe(false);
    expect(Utils.convertToBoolean(null)).toBe(false);
    expect(Utils.convertToBoolean('true')).toBe(true);
    expect(Utils.convertToBoolean('false')).toBe(false);
    expect(Utils.convertToBoolean('TRUE')).toBe(true);
    expect(Utils.convertToBoolean('FALSE')).toBe(false);
    expect(Utils.convertToBoolean('1')).toBe(true);
    expect(Utils.convertToBoolean('0')).toBe(false);
    expect(Utils.convertToBoolean(1)).toBe(true);
    expect(Utils.convertToBoolean(0)).toBe(false);
    expect(Utils.convertToBoolean(true)).toBe(true);
    expect(Utils.convertToBoolean(false)).toBe(false);
    expect(Utils.convertToBoolean('')).toBe(false);
    expect(Utils.convertToBoolean('NoNBoolean')).toBe(false);
  });

  it('Verify secureRandom()', () => {
    const random = Utils.secureRandom();
    expect(typeof random === 'number').toBe(true);
    expect(random).toBeGreaterThanOrEqual(0);
    expect(random).toBeLessThan(1);
  });

  it('Verify getRandomInteger()', () => {
    let randomInteger = Utils.getRandomInteger();
    expect(Number.isSafeInteger(randomInteger)).toBe(true);
    expect(randomInteger).toBeGreaterThanOrEqual(0);
    expect(randomInteger).toBeLessThanOrEqual(Number.MAX_SAFE_INTEGER);
    expect(() => Utils.getRandomInteger(0, 1)).toThrowError(new RangeError('Invalid interval'));
    expect(() => Utils.getRandomInteger(-1)).toThrowError(new RangeError('Invalid interval'));
    expect(() => Utils.getRandomInteger(0, -1)).toThrowError(new RangeError('Invalid interval'));
    randomInteger = Utils.getRandomInteger(2, 1);
    expect(randomInteger).toBeGreaterThanOrEqual(1);
    expect(randomInteger).toBeLessThanOrEqual(2);
    const max = 2.2,
      min = 1.1;
    randomInteger = Utils.getRandomInteger(max, min);
    expect(randomInteger).toBeGreaterThanOrEqual(Math.ceil(min));
    expect(randomInteger).toBeLessThanOrEqual(Math.floor(max));
  });

  it('Verify getRandomFloat()', () => {
    let randomFloat = Utils.getRandomFloat();
    expect(typeof randomFloat === 'number').toBe(true);
    expect(randomFloat).toBeGreaterThanOrEqual(0);
    expect(randomFloat).toBeLessThanOrEqual(Number.MAX_VALUE);
    expect(() => Utils.getRandomFloat(0, 1)).toThrowError(new RangeError('Invalid interval'));
    expect(() => Utils.getRandomFloat(-1)).toThrowError(new RangeError('Invalid interval'));
    expect(() => Utils.getRandomFloat(0, -1)).toThrowError(new RangeError('Invalid interval'));
    randomFloat = Utils.getRandomFloat(Number.MAX_VALUE, 0, true);
    expect(randomFloat).toBeGreaterThanOrEqual(-Number.MAX_VALUE);
    expect(randomFloat).toBeLessThanOrEqual(Number.MAX_VALUE);
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
    expect(Utils.isIterable(new WeakMap())).toBe(false);
    expect(Utils.isIterable(new WeakSet())).toBe(false);
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
    expect(Utils.isEmptyString(new WeakMap())).toBe(false);
    expect(Utils.isEmptyString(new WeakSet())).toBe(false);
  });

  it('Verify isUndefined()', () => {
    expect(Utils.isUndefined(undefined)).toBe(true);
    expect(Utils.isUndefined(null)).toBe(false);
    expect(Utils.isUndefined('')).toBe(false);
    expect(Utils.isUndefined(0)).toBe(false);
    expect(Utils.isUndefined({})).toBe(false);
    expect(Utils.isUndefined([])).toBe(false);
    expect(Utils.isUndefined(new Map())).toBe(false);
    expect(Utils.isUndefined(new Set())).toBe(false);
    expect(Utils.isUndefined(new WeakMap())).toBe(false);
    expect(Utils.isUndefined(new WeakSet())).toBe(false);
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
    expect(Utils.isNullOrUndefined(new WeakMap())).toBe(false);
    expect(Utils.isNullOrUndefined(new WeakSet())).toBe(false);
  });

  it('Verify isEmptyArray()', () => {
    expect(Utils.isEmptyArray([])).toBe(true);
    expect(Utils.isEmptyArray([1, 2])).toBe(false);
    expect(Utils.isEmptyArray(null)).toBe(true);
    expect(Utils.isEmptyArray(undefined)).toBe(true);
    expect(Utils.isEmptyArray('')).toBe(true);
    expect(Utils.isEmptyArray('test')).toBe(true);
    expect(Utils.isEmptyArray(0)).toBe(true);
    expect(Utils.isEmptyArray({})).toBe(true);
    expect(Utils.isEmptyArray(new Map())).toBe(true);
    expect(Utils.isEmptyArray(new Set())).toBe(true);
    expect(Utils.isEmptyArray(new WeakMap())).toBe(true);
    expect(Utils.isEmptyArray(new WeakSet())).toBe(true);
  });

  it('Verify isEmptyObject()', () => {
    expect(Utils.isEmptyObject({})).toBe(true);
    expect(Utils.isEmptyObject({ 1: 1, 2: 2 })).toBe(false);
    expect(Utils.isEmptyObject(null)).toBe(false);
    expect(Utils.isEmptyObject(undefined)).toBe(false);
    expect(Utils.isEmptyObject(new Map())).toBe(false);
    expect(Utils.isEmptyObject(new Set())).toBe(false);
    expect(Utils.isEmptyObject(new WeakMap())).toBe(false);
    expect(Utils.isEmptyObject(new WeakSet())).toBe(false);
  });
});
