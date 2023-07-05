import { expect } from 'expect';

import { Constants } from '../../src/utils/Constants';
import {
  cloneObject,
  convertToBoolean,
  convertToDate,
  convertToFloat,
  convertToInt,
  generateUUID,
  getRandomFloat,
  getRandomInteger,
  hasOwnProp,
  isEmptyArray,
  isEmptyObject,
  isEmptyString,
  isIterable,
  isNotEmptyArray,
  isNotEmptyString,
  isNullOrUndefined,
  isObject,
  isUndefined,
  roundTo,
  secureRandom,
  sleep,
  validateUUID,
} from '../../src/utils/Utils';

describe('Utils test suite', () => {
  it('Verify generateUUID()/validateUUID()', () => {
    const uuid = generateUUID();
    expect(uuid).toBeDefined();
    expect(uuid.length).toEqual(36);
    expect(validateUUID(uuid)).toBe(true);
    expect(validateUUID('abcdef00-0000-4000-0000-000000000000')).toBe(true);
    expect(validateUUID('')).toBe(false);
    // Shall invalidate Nil UUID
    expect(validateUUID('00000000-0000-0000-0000-000000000000')).toBe(false);
    expect(validateUUID('987FBC9-4BED-3078-CF07A-9141BA07C9F3')).toBe(false);
  });

  it('Verify sleep()', async () => {
    const start = performance.now();
    await sleep(1000);
    const end = performance.now();
    expect(end - start).toBeGreaterThanOrEqual(1000);
  });

  it('Verify convertToDate()', () => {
    expect(convertToDate(undefined)).toBe(undefined);
    expect(convertToDate(null)).toBe(null);
    const invalidDate = convertToDate('');
    expect(invalidDate instanceof Date && !isNaN(invalidDate.getTime())).toBe(false);
    expect(convertToDate(0)).toStrictEqual(new Date('1970-01-01T00:00:00.000Z'));
    const dateStr = '2020-01-01T00:00:00.000Z';
    let date = convertToDate(dateStr);
    expect(date).toBeInstanceOf(Date);
    expect(date).toStrictEqual(new Date(dateStr));
    date = convertToDate(new Date(dateStr));
    expect(date).toBeInstanceOf(Date);
    expect(date).toStrictEqual(new Date(dateStr));
  });

  it('Verify convertToInt()', () => {
    expect(convertToInt(undefined)).toBe(0);
    expect(convertToInt(null)).toBe(0);
    expect(convertToInt(0)).toBe(0);
    const randomInteger = getRandomInteger();
    expect(convertToInt(randomInteger)).toEqual(randomInteger);
    expect(convertToInt('-1')).toBe(-1);
    expect(convertToInt('1')).toBe(1);
    expect(convertToInt('1.1')).toBe(1);
    expect(convertToInt('1.9')).toBe(1);
    expect(convertToInt('1.999')).toBe(1);
    expect(convertToInt(-1)).toBe(-1);
    expect(convertToInt(1)).toBe(1);
    expect(convertToInt(1.1)).toBe(1);
    expect(convertToInt(1.9)).toBe(1);
    expect(convertToInt(1.999)).toBe(1);
    expect(() => {
      convertToInt('NaN');
    }).toThrow('Cannot convert to integer: NaN');
  });

  it('Verify convertToFloat()', () => {
    expect(convertToFloat(undefined)).toBe(0);
    expect(convertToFloat(null)).toBe(0);
    expect(convertToFloat(0)).toBe(0);
    const randomFloat = getRandomFloat();
    expect(convertToFloat(randomFloat)).toEqual(randomFloat);
    expect(convertToFloat('-1')).toBe(-1);
    expect(convertToFloat('1')).toBe(1);
    expect(convertToFloat('1.1')).toBe(1.1);
    expect(convertToFloat('1.9')).toBe(1.9);
    expect(convertToFloat('1.999')).toBe(1.999);
    expect(convertToFloat(-1)).toBe(-1);
    expect(convertToFloat(1)).toBe(1);
    expect(convertToFloat(1.1)).toBe(1.1);
    expect(convertToFloat(1.9)).toBe(1.9);
    expect(convertToFloat(1.999)).toBe(1.999);
    expect(() => {
      convertToFloat('NaN');
    }).toThrow('Cannot convert to float: NaN');
  });

  it('Verify convertToBoolean()', () => {
    expect(convertToBoolean(undefined)).toBe(false);
    expect(convertToBoolean(null)).toBe(false);
    expect(convertToBoolean('true')).toBe(true);
    expect(convertToBoolean('false')).toBe(false);
    expect(convertToBoolean('TRUE')).toBe(true);
    expect(convertToBoolean('FALSE')).toBe(false);
    expect(convertToBoolean('1')).toBe(true);
    expect(convertToBoolean('0')).toBe(false);
    expect(convertToBoolean(1)).toBe(true);
    expect(convertToBoolean(0)).toBe(false);
    expect(convertToBoolean(true)).toBe(true);
    expect(convertToBoolean(false)).toBe(false);
    expect(convertToBoolean('')).toBe(false);
    expect(convertToBoolean('NoNBoolean')).toBe(false);
  });

  it('Verify secureRandom()', () => {
    const random = secureRandom();
    expect(typeof random === 'number').toBe(true);
    expect(random).toBeGreaterThanOrEqual(0);
    expect(random).toBeLessThan(1);
  });

  it('Verify getRandomInteger()', () => {
    let randomInteger = getRandomInteger();
    expect(Number.isSafeInteger(randomInteger)).toBe(true);
    expect(randomInteger).toBeGreaterThanOrEqual(0);
    expect(randomInteger).toBeLessThanOrEqual(Constants.MAX_RANDOM_INTEGER);
    expect(randomInteger).not.toEqual(getRandomInteger());
    randomInteger = getRandomInteger(0, -Constants.MAX_RANDOM_INTEGER);
    expect(randomInteger).toBeGreaterThanOrEqual(-Constants.MAX_RANDOM_INTEGER);
    expect(randomInteger).toBeLessThanOrEqual(0);
    expect(() => getRandomInteger(0, 1)).toThrowError(
      'The value of "max" is out of range. It must be greater than the value of "min" (1). Received 1'
    );
    expect(() => getRandomInteger(-1)).toThrowError(
      'The value of "max" is out of range. It must be greater than the value of "min" (0). Received 0'
    );
    expect(() => getRandomInteger(Constants.MAX_RANDOM_INTEGER + 1)).toThrowError(
      `The value of "max" is out of range. It must be <= ${
        Constants.MAX_RANDOM_INTEGER + 1
      }. Received 281_474_976_710_656`
    );
    randomInteger = getRandomInteger(2, 1);
    expect(randomInteger).toBeGreaterThanOrEqual(1);
    expect(randomInteger).toBeLessThanOrEqual(2);
    const max = 2.2,
      min = 1.1;
    randomInteger = getRandomInteger(max, min);
    expect(randomInteger).toBeGreaterThanOrEqual(Math.ceil(min));
    expect(randomInteger).toBeLessThanOrEqual(Math.floor(max));
  });

  it('Verify roundTo()', () => {
    expect(roundTo(0, 2)).toBe(0);
    expect(roundTo(0.5, 0)).toBe(1);
    expect(roundTo(0.5, 2)).toBe(0.5);
    expect(roundTo(-0.5, 0)).toBe(-1);
    expect(roundTo(-0.5, 2)).toBe(-0.5);
    expect(roundTo(1.005, 0)).toBe(1);
    expect(roundTo(1.005, 2)).toBe(1.01);
    expect(roundTo(2.175, 2)).toBe(2.18);
    expect(roundTo(5.015, 2)).toBe(5.02);
    expect(roundTo(-1.005, 2)).toBe(-1.01);
    expect(roundTo(-2.175, 2)).toBe(-2.18);
    expect(roundTo(-5.015, 2)).toBe(-5.02);
  });

  it('Verify getRandomFloat()', () => {
    let randomFloat = getRandomFloat();
    expect(typeof randomFloat === 'number').toBe(true);
    expect(randomFloat).toBeGreaterThanOrEqual(0);
    expect(randomFloat).toBeLessThanOrEqual(Number.MAX_VALUE);
    expect(randomFloat).not.toEqual(getRandomFloat());
    expect(() => getRandomFloat(0, 1)).toThrowError(new RangeError('Invalid interval'));
    expect(() => getRandomFloat(Number.MAX_VALUE, -Number.MAX_VALUE)).toThrowError(
      new RangeError('Invalid interval')
    );
    randomFloat = getRandomFloat(0, -Number.MAX_VALUE);
    expect(randomFloat).toBeGreaterThanOrEqual(-Number.MAX_VALUE);
    expect(randomFloat).toBeLessThanOrEqual(0);
  });

  it('Verify isObject()', () => {
    expect(isObject('test')).toBe(false);
    expect(isObject(undefined)).toBe(false);
    expect(isObject(null)).toBe(false);
    expect(isObject(0)).toBe(false);
    expect(isObject([])).toBe(false);
    expect(isObject([0, 1])).toBe(false);
    expect(isObject(['0', '1'])).toBe(false);
    expect(isObject({})).toBe(true);
    expect(isObject({ 1: 1 })).toBe(true);
    expect(isObject({ '1': '1' })).toBe(true);
    expect(isObject(new Map())).toBe(true);
    expect(isObject(new Set())).toBe(true);
    expect(isObject(new WeakMap())).toBe(true);
    expect(isObject(new WeakSet())).toBe(true);
  });

  it('Verify cloneObject()', () => {
    const obj = { 1: 1 };
    expect(cloneObject(obj)).toStrictEqual(obj);
    expect(cloneObject(obj) === obj).toBe(false);
    const array = [1, 2];
    expect(cloneObject(array)).toStrictEqual(array);
    expect(cloneObject(array) === array).toBe(false);
    const date = new Date();
    expect(cloneObject(date)).toStrictEqual(date);
    expect(cloneObject(date) === date).toBe(false);
    const map = new Map([['1', '2']]);
    expect(cloneObject(map)).toStrictEqual(map);
    expect(cloneObject(map) === map).toBe(false);
    const set = new Set(['1']);
    expect(cloneObject(set)).toStrictEqual(set);
    expect(cloneObject(set) === set).toBe(false);
    // The URL object seems to have not enumerable properties
    const url = new URL('https://domain.tld');
    expect(cloneObject(url)).toStrictEqual(url);
    expect(cloneObject(url) === url).toBe(true);
    const weakMap = new WeakMap([[{ 1: 1 }, { 2: 2 }]]);
    expect(cloneObject(weakMap)).toStrictEqual(weakMap);
    expect(cloneObject(weakMap) === weakMap).toBe(true);
    const weakSet = new WeakSet([{ 1: 1 }, { 2: 2 }]);
    expect(cloneObject(weakSet)).toStrictEqual(weakSet);
    expect(cloneObject(weakSet) === weakSet).toBe(true);
  });

  it('Verify hasOwnProp()', () => {
    expect(hasOwnProp('test', '')).toBe(false);
    expect(hasOwnProp(undefined, '')).toBe(false);
    expect(hasOwnProp(null, '')).toBe(false);
    expect(hasOwnProp([], '')).toBe(false);
    expect(hasOwnProp({}, '')).toBe(false);
    expect(hasOwnProp({ 1: 1 }, 1)).toBe(true);
    expect(hasOwnProp({ 1: 1 }, '1')).toBe(true);
    expect(hasOwnProp({ 1: 1 }, 2)).toBe(false);
    expect(hasOwnProp({ 1: 1 }, '2')).toBe(false);
    expect(hasOwnProp({ '1': '1' }, '1')).toBe(true);
    expect(hasOwnProp({ '1': '1' }, 1)).toBe(true);
    expect(hasOwnProp({ '1': '1' }, '2')).toBe(false);
    expect(hasOwnProp({ '1': '1' }, 2)).toBe(false);
  });

  it('Verify isIterable()', () => {
    expect(isIterable('')).toBe(true);
    expect(isIterable(' ')).toBe(true);
    expect(isIterable('test')).toBe(true);
    expect(isIterable(undefined)).toBe(false);
    expect(isIterable(null)).toBe(false);
    expect(isIterable(0)).toBe(false);
    expect(isIterable([0, 1])).toBe(true);
    expect(isIterable({ 1: 1 })).toBe(false);
    expect(isIterable(new Map())).toBe(true);
    expect(isIterable(new Set())).toBe(true);
    expect(isIterable(new WeakMap())).toBe(false);
    expect(isIterable(new WeakSet())).toBe(false);
  });

  it('Verify isEmptyString()', () => {
    expect(isEmptyString('')).toBe(true);
    expect(isEmptyString(' ')).toBe(true);
    expect(isEmptyString('     ')).toBe(true);
    expect(isEmptyString('test')).toBe(false);
    expect(isEmptyString(' test')).toBe(false);
    expect(isEmptyString('test ')).toBe(false);
    expect(isEmptyString(undefined)).toBe(true);
    expect(isEmptyString(null)).toBe(true);
    expect(isEmptyString(0)).toBe(false);
    expect(isEmptyString({})).toBe(false);
    expect(isEmptyString([])).toBe(false);
    expect(isEmptyString(new Map())).toBe(false);
    expect(isEmptyString(new Set())).toBe(false);
    expect(isEmptyString(new WeakMap())).toBe(false);
    expect(isEmptyString(new WeakSet())).toBe(false);
  });

  it('Verify isNotEmptyString()', () => {
    expect(isNotEmptyString('')).toBe(false);
    expect(isNotEmptyString(' ')).toBe(false);
    expect(isNotEmptyString('     ')).toBe(false);
    expect(isNotEmptyString('test')).toBe(true);
    expect(isNotEmptyString(' test')).toBe(true);
    expect(isNotEmptyString('test ')).toBe(true);
    expect(isNotEmptyString(undefined)).toBe(false);
    expect(isNotEmptyString(null)).toBe(false);
    expect(isNotEmptyString(0)).toBe(false);
    expect(isNotEmptyString({})).toBe(false);
    expect(isNotEmptyString([])).toBe(false);
    expect(isNotEmptyString(new Map())).toBe(false);
    expect(isNotEmptyString(new Set())).toBe(false);
    expect(isNotEmptyString(new WeakMap())).toBe(false);
    expect(isNotEmptyString(new WeakSet())).toBe(false);
  });

  it('Verify isUndefined()', () => {
    expect(isUndefined(undefined)).toBe(true);
    expect(isUndefined(null)).toBe(false);
    expect(isUndefined('')).toBe(false);
    expect(isUndefined(0)).toBe(false);
    expect(isUndefined({})).toBe(false);
    expect(isUndefined([])).toBe(false);
    expect(isUndefined(new Map())).toBe(false);
    expect(isUndefined(new Set())).toBe(false);
    expect(isUndefined(new WeakMap())).toBe(false);
    expect(isUndefined(new WeakSet())).toBe(false);
  });

  it('Verify isNullOrUndefined()', () => {
    expect(isNullOrUndefined(undefined)).toBe(true);
    expect(isNullOrUndefined(null)).toBe(true);
    expect(isNullOrUndefined('')).toBe(false);
    expect(isNullOrUndefined(0)).toBe(false);
    expect(isNullOrUndefined({})).toBe(false);
    expect(isNullOrUndefined([])).toBe(false);
    expect(isNullOrUndefined(new Map())).toBe(false);
    expect(isNullOrUndefined(new Set())).toBe(false);
    expect(isNullOrUndefined(new WeakMap())).toBe(false);
    expect(isNullOrUndefined(new WeakSet())).toBe(false);
  });

  it('Verify isEmptyArray()', () => {
    expect(isEmptyArray([])).toBe(true);
    expect(isEmptyArray([1, 2])).toBe(false);
    expect(isEmptyArray(['1', '2'])).toBe(false);
    expect(isEmptyArray(undefined)).toBe(false);
    expect(isEmptyArray(null)).toBe(false);
    expect(isEmptyArray('')).toBe(false);
    expect(isEmptyArray('test')).toBe(false);
    expect(isEmptyArray(0)).toBe(false);
    expect(isEmptyArray({})).toBe(false);
    expect(isEmptyArray(new Map())).toBe(false);
    expect(isEmptyArray(new Set())).toBe(false);
    expect(isEmptyArray(new WeakMap())).toBe(false);
    expect(isEmptyArray(new WeakSet())).toBe(false);
  });

  it('Verify isNotEmptyArray()', () => {
    expect(isNotEmptyArray([])).toBe(false);
    expect(isNotEmptyArray([1, 2])).toBe(true);
    expect(isNotEmptyArray(['1', '2'])).toBe(true);
    expect(isNotEmptyArray(undefined)).toBe(false);
    expect(isNotEmptyArray(null)).toBe(false);
    expect(isNotEmptyArray('')).toBe(false);
    expect(isNotEmptyArray('test')).toBe(false);
    expect(isNotEmptyArray(0)).toBe(false);
    expect(isNotEmptyArray({})).toBe(false);
    expect(isNotEmptyArray(new Map())).toBe(false);
    expect(isNotEmptyArray(new Set())).toBe(false);
    expect(isNotEmptyArray(new WeakMap())).toBe(false);
    expect(isNotEmptyArray(new WeakSet())).toBe(false);
  });

  it('Verify isEmptyObject()', () => {
    expect(isEmptyObject({})).toBe(true);
    expect(isEmptyObject({ 1: 1, 2: 2 })).toBe(false);
    expect(isEmptyObject(undefined)).toBe(false);
    expect(isEmptyObject(null)).toBe(false);
    expect(isEmptyObject(new Map())).toBe(false);
    expect(isEmptyObject(new Set())).toBe(false);
    expect(isEmptyObject(new WeakMap())).toBe(false);
    expect(isEmptyObject(new WeakSet())).toBe(false);
  });
});
