const uuidV4 = require('uuid/v4');

class Utils {
  static generateGUID() {
    return uuidV4();
  }

  static sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  static secondstoHHMMSS(seconds) {
    const date = new Date(null);
    date.setSeconds(seconds);
    return date.toISOString().substr(11, 8);
  }

  static convertToDate(date) {
    // Check
    if (!date) {
      return date;
    }
    // Check Type
    if (!(date instanceof Date)) {
      return new Date(date);
    }
    return date;
  }

  static isIterable(obj) {
    if (obj) {
      return typeof obj[Symbol.iterator] === 'function';
    }
    return false;
  }

  static isEmptyJSon(document) {
    // Empty?
    if (!document) {
      return true;
    }
    // Check type
    if (typeof document !== 'object') {
      return true;
    }
    // Check
    return Object.keys(document).length === 0;
  }

  static removeExtraEmptyLines(tab) {
    // Start from the end
    for (let i = tab.length - 1; i > 0; i--) {
      // Two consecutive empty lines?
      if (tab[i].length === 0 && tab[i - 1].length === 0) {
        // Remove the last one
        tab.splice(i, 1);
      }
      // Check last line
      if (i === 1 && tab[i - 1].length === 0) {
        // Remove the first one
        tab.splice(i - 1, 1);
      }
    }
  }

  static convertToObjectID(id) {
    let changedID = id;
    // Check
    if (typeof id === 'string') {
      // Create Object
      // eslint-disable-next-line no-undef
      changedID = new ObjectID(id);
    }
    return changedID;
  }

  static convertToInt(id) {
    let changedID = id;
    if (!id) {
      return 0;
    }
    // Check
    if (typeof id === 'string') {
      // Create Object
      changedID = parseInt(id);
    }
    return changedID;
  }

  static convertToFloat(id) {
    let changedID = id;
    if (!id) {
      return 0;
    }
    // Check
    if (typeof id === 'string') {
      // Create Object
      changedID = parseFloat(id);
    }
    return changedID;
  }

  static getRandomInt(max, min) {
    if (min) {
      return Math.floor((Math.random() * (max - min)) + min);
    }
    return Math.floor((Math.random() * max));
  }

  static basicFormatLog(prefixString = '') {
    const date = new Date();
    return date.toISOString().substr(0, 19) + prefixString;
  }
}

module.exports = Utils;
