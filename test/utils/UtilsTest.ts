import { expect } from 'expect';

import { Constants } from '../../src/utils/Constants';
import { Utils } from '../../src/utils/Utils';

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
    const start = performance.now();
    await Utils.sleep(1000);
    const end = performance.now();
    expect(end - start).toBeGreaterThanOrEqual(1000);
  });

  it('Verify convertToDate()', () => {
    expect(Utils.convertToDate(undefined)).toBe(undefined);
    expect(Utils.convertToDate(null)).toBe(null);
    const invalidDate = Utils.convertToDate('');
    expect(invalidDate instanceof Date && !isNaN(invalidDate.getTime())).toBe(false);
    expect(Utils.convertToDate(0)).toStrictEqual(new Date('1970-01-01T00:00:00.000Z'));
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
    expect(() => {
      Utils.convertToInt('NaN');
    }).toThrow('Cannot convert to integer: NaN');
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
    expect(() => {
      Utils.convertToFloat('NaN');
    }).toThrow('Cannot convert to float: NaN');
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
    expect(randomInteger).toBeLessThanOrEqual(Constants.MAX_RANDOM_INTEGER);
    expect(randomInteger).not.toEqual(Utils.getRandomInteger());
    randomInteger = Utils.getRandomInteger(0, -Constants.MAX_RANDOM_INTEGER);
    expect(randomInteger).toBeGreaterThanOrEqual(-Constants.MAX_RANDOM_INTEGER);
    expect(randomInteger).toBeLessThanOrEqual(0);
    expect(() => Utils.getRandomInteger(0, 1)).toThrowError(
      'The value of "max" is out of range. It must be greater than the value of "min" (1). Received 1'
    );
    expect(() => Utils.getRandomInteger(-1)).toThrowError(
      'The value of "max" is out of range. It must be greater than the value of "min" (0). Received 0'
    );
    expect(() => Utils.getRandomInteger(Constants.MAX_RANDOM_INTEGER + 1)).toThrowError(
      `The value of "max" is out of range. It must be <= ${
        Constants.MAX_RANDOM_INTEGER + 1
      }. Received 281_474_976_710_656`
    );
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
    expect(randomFloat).not.toEqual(Utils.getRandomFloat());
    expect(() => Utils.getRandomFloat(0, 1)).toThrowError(new RangeError('Invalid interval'));
    expect(() => Utils.getRandomFloat(Number.MAX_VALUE, -Number.MAX_VALUE)).toThrowError(
      new RangeError('Invalid interval')
    );
    randomFloat = Utils.getRandomFloat(0, -Number.MAX_VALUE);
    expect(randomFloat).toBeGreaterThanOrEqual(-Number.MAX_VALUE);
    expect(randomFloat).toBeLessThanOrEqual(0);
  });

  it('Verify isObject()', () => {
    expect(Utils.isObject('test')).toBe(false);
    expect(Utils.isObject(undefined)).toBe(false);
    expect(Utils.isObject(null)).toBe(false);
    expect(Utils.isObject(0)).toBe(false);
    expect(Utils.isObject([])).toBe(false);
    expect(Utils.isObject([0, 1])).toBe(false);
    expect(Utils.isObject(['0', '1'])).toBe(false);
    expect(Utils.isObject({})).toBe(true);
    expect(Utils.isObject({ 1: 1 })).toBe(true);
    expect(Utils.isObject({ '1': '1' })).toBe(true);
    expect(Utils.isObject(new Map())).toBe(true);
    expect(Utils.isObject(new Set())).toBe(true);
    expect(Utils.isObject(new WeakMap())).toBe(true);
    expect(Utils.isObject(new WeakSet())).toBe(true);
  });

  it('Verify cloneObject()', () => {
    const obj = { 1: 1 };
    expect(Utils.cloneObject(obj)).toStrictEqual(obj);
    expect(Utils.cloneObject(obj) === obj).toBe(false);
    const array = [1, 2];
    expect(Utils.cloneObject(array)).toStrictEqual(array);
    expect(Utils.cloneObject(array) === array).toBe(false);
    const date = new Date();
    expect(Utils.cloneObject(date)).toStrictEqual(date);
    expect(Utils.cloneObject(date) === date).toBe(false);
    const map = new Map([['1', '2']]);
    expect(Utils.cloneObject(map)).toStrictEqual(map);
    expect(Utils.cloneObject(map) === map).toBe(false);
    const set = new Set(['1']);
    expect(Utils.cloneObject(set)).toStrictEqual(set);
    expect(Utils.cloneObject(set) === set).toBe(false);
    // The URL object seems to have not enumerable properties
    const url = new URL('https://domain.tld');
    expect(Utils.cloneObject(url)).toStrictEqual(url);
    expect(Utils.cloneObject(url) === url).toBe(true);
    const weakMap = new WeakMap([[{ 1: 1 }, { 2: 2 }]]);
    expect(Utils.cloneObject(weakMap)).toStrictEqual(weakMap);
    expect(Utils.cloneObject(weakMap) === weakMap).toBe(true);
    const weakSet = new WeakSet([{ 1: 1 }, { 2: 2 }]);
    expect(Utils.cloneObject(weakSet)).toStrictEqual(weakSet);
    expect(Utils.cloneObject(weakSet) === weakSet).toBe(true);
  });

  it('Verify hasOwnProp()', () => {
    expect(Utils.hasOwnProp('test', '')).toBe(false);
    expect(Utils.hasOwnProp(undefined, '')).toBe(false);
    expect(Utils.hasOwnProp(null, '')).toBe(false);
    expect(Utils.hasOwnProp([], '')).toBe(false);
    expect(Utils.hasOwnProp({}, '')).toBe(false);
    expect(Utils.hasOwnProp({ 1: 1 }, 1)).toBe(true);
    expect(Utils.hasOwnProp({ 1: 1 }, '1')).toBe(true);
    expect(Utils.hasOwnProp({ 1: 1 }, 2)).toBe(false);
    expect(Utils.hasOwnProp({ 1: 1 }, '2')).toBe(false);
    expect(Utils.hasOwnProp({ '1': '1' }, '1')).toBe(true);
    expect(Utils.hasOwnProp({ '1': '1' }, 1)).toBe(true);
    expect(Utils.hasOwnProp({ '1': '1' }, '2')).toBe(false);
    expect(Utils.hasOwnProp({ '1': '1' }, 2)).toBe(false);
  });

  it('Verify isIterable()', () => {
    expect(Utils.isIterable('')).toBe(true);
    expect(Utils.isIterable(' ')).toBe(true);
    expect(Utils.isIterable('test')).toBe(true);
    expect(Utils.isIterable(undefined)).toBe(false);
    expect(Utils.isIterable(null)).toBe(false);
    expect(Utils.isIterable(0)).toBe(false);
    expect(Utils.isIterable([0, 1])).toBe(true);
    expect(Utils.isIterable({ 1: 1 })).toBe(false);
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
    expect(Utils.isEmptyString(undefined)).toBe(true);
    expect(Utils.isEmptyString(null)).toBe(true);
    expect(Utils.isEmptyString(0)).toBe(false);
    expect(Utils.isEmptyString({})).toBe(false);
    expect(Utils.isEmptyString([])).toBe(false);
    expect(Utils.isEmptyString(new Map())).toBe(false);
    expect(Utils.isEmptyString(new Set())).toBe(false);
    expect(Utils.isEmptyString(new WeakMap())).toBe(false);
    expect(Utils.isEmptyString(new WeakSet())).toBe(false);
  });

  it('Verify isNotEmptyString()', () => {
    expect(Utils.isNotEmptyString('')).toBe(false);
    expect(Utils.isNotEmptyString(' ')).toBe(false);
    expect(Utils.isNotEmptyString('     ')).toBe(false);
    expect(Utils.isNotEmptyString('test')).toBe(true);
    expect(Utils.isNotEmptyString(' test')).toBe(true);
    expect(Utils.isNotEmptyString('test ')).toBe(true);
    expect(Utils.isNotEmptyString(undefined)).toBe(false);
    expect(Utils.isNotEmptyString(null)).toBe(false);
    expect(Utils.isNotEmptyString(0)).toBe(false);
    expect(Utils.isNotEmptyString({})).toBe(false);
    expect(Utils.isNotEmptyString([])).toBe(false);
    expect(Utils.isNotEmptyString(new Map())).toBe(false);
    expect(Utils.isNotEmptyString(new Set())).toBe(false);
    expect(Utils.isNotEmptyString(new WeakMap())).toBe(false);
    expect(Utils.isNotEmptyString(new WeakSet())).toBe(false);
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
    expect(Utils.isNullOrUndefined(undefined)).toBe(true);
    expect(Utils.isNullOrUndefined(null)).toBe(true);
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
    expect(Utils.isEmptyArray(['1', '2'])).toBe(false);
    expect(Utils.isEmptyArray(undefined)).toBe(false);
    expect(Utils.isEmptyArray(null)).toBe(false);
    expect(Utils.isEmptyArray('')).toBe(false);
    expect(Utils.isEmptyArray('test')).toBe(false);
    expect(Utils.isEmptyArray(0)).toBe(false);
    expect(Utils.isEmptyArray({})).toBe(false);
    expect(Utils.isEmptyArray(new Map())).toBe(false);
    expect(Utils.isEmptyArray(new Set())).toBe(false);
    expect(Utils.isEmptyArray(new WeakMap())).toBe(false);
    expect(Utils.isEmptyArray(new WeakSet())).toBe(false);
  });

  it('Verify isNotEmptyArray()', () => {
    expect(Utils.isNotEmptyArray([])).toBe(false);
    expect(Utils.isNotEmptyArray([1, 2])).toBe(true);
    expect(Utils.isNotEmptyArray(['1', '2'])).toBe(true);
    expect(Utils.isNotEmptyArray(undefined)).toBe(false);
    expect(Utils.isNotEmptyArray(null)).toBe(false);
    expect(Utils.isNotEmptyArray('')).toBe(false);
    expect(Utils.isNotEmptyArray('test')).toBe(false);
    expect(Utils.isNotEmptyArray(0)).toBe(false);
    expect(Utils.isNotEmptyArray({})).toBe(false);
    expect(Utils.isNotEmptyArray(new Map())).toBe(false);
    expect(Utils.isNotEmptyArray(new Set())).toBe(false);
    expect(Utils.isNotEmptyArray(new WeakMap())).toBe(false);
    expect(Utils.isNotEmptyArray(new WeakSet())).toBe(false);
  });

  it('Verify isEmptyObject()', () => {
    expect(Utils.isEmptyObject({})).toBe(true);
    expect(Utils.isEmptyObject({ 1: 1, 2: 2 })).toBe(false);
    expect(Utils.isEmptyObject(undefined)).toBe(false);
    expect(Utils.isEmptyObject(null)).toBe(false);
    expect(Utils.isEmptyObject(new Map())).toBe(false);
    expect(Utils.isEmptyObject(new Set())).toBe(false);
    expect(Utils.isEmptyObject(new WeakMap())).toBe(false);
    expect(Utils.isEmptyObject(new WeakSet())).toBe(false);
  });

  it('Verify median()', () => {
    const array0 = [0.08];
    expect(Utils.median(array0)).toBe(0.08);
    const array1 = [0.25, 4.75, 3.05, 6.04, 1.01, 2.02, 5.03];
    expect(Utils.median(array1)).toBe(3.05);
  });

  it('Verify percentile()', () => {
    expect(Utils.percentile([], 25)).toBe(undefined);
    const array0 = [0.08];
    expect(Utils.percentile(array0, 50)).toBe(0.08);
    const array1 = [0.25, 4.75, 3.05, 6.04, 1.01, 2.02, 5.03];
    expect(Utils.percentile(array1, 0)).toBe(0.25);
    expect(Utils.percentile(array1, 50)).toBe(3.05);
    expect(Utils.percentile(array1, 80)).toBe(4.974);
    expect(Utils.percentile(array1, 85)).toBe(5.131);
    expect(Utils.percentile(array1, 90)).toBe(5.434);
    expect(Utils.percentile(array1, 95)).toBe(5.736999999999999);
    expect(Utils.percentile(array1, 100)).toBe(6.04);
  });

  it('Verify stdDeviation()', () => {
    const array1 = [0.25, 4.75, 3.05, 6.04, 1.01, 2.02, 5.03];
    expect(Utils.stdDeviation(array1)).toBe(2.0256064851429216);
  });
});
