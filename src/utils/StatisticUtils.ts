import { Utils } from './Utils';

export const median = (dataSet: number[]): number => {
  if (Utils.isEmptyArray(dataSet)) {
    return 0;
  }
  if (Array.isArray(dataSet) === true && dataSet.length === 1) {
    return dataSet[0];
  }
  const sortedDataSet = dataSet.slice().sort((a, b) => a - b);
  return (
    (sortedDataSet[(sortedDataSet.length - 1) >> 1] + sortedDataSet[sortedDataSet.length >> 1]) / 2
  );
};

// TODO: use order statistics tree https://en.wikipedia.org/wiki/Order_statistic_tree
export const nthPercentile = (dataSet: number[], percentile: number): number => {
  if (percentile < 0 && percentile > 100) {
    throw new RangeError('Percentile is not between 0 and 100');
  }
  if (Utils.isEmptyArray(dataSet)) {
    return 0;
  }
  const sortedDataSet = dataSet.slice().sort((a, b) => a - b);
  if (percentile === 0 || sortedDataSet.length === 1) {
    return sortedDataSet[0];
  }
  if (percentile === 100) {
    return sortedDataSet[sortedDataSet.length - 1];
  }
  const percentileIndexBase = (percentile / 100) * (sortedDataSet.length - 1);
  const percentileIndexInteger = Math.floor(percentileIndexBase);
  if (!Utils.isNullOrUndefined(sortedDataSet[percentileIndexInteger + 1])) {
    return (
      sortedDataSet[percentileIndexInteger] +
      (percentileIndexBase - percentileIndexInteger) *
        (sortedDataSet[percentileIndexInteger + 1] - sortedDataSet[percentileIndexInteger])
    );
  }
  return sortedDataSet[percentileIndexInteger];
};

export const stdDeviation = (dataSet: number[]): number => {
  let totalDataSet = 0;
  for (const data of dataSet) {
    totalDataSet += data;
  }
  const dataSetMean = totalDataSet / dataSet.length;
  let totalGeometricDeviation = 0;
  for (const data of dataSet) {
    const deviation = data - dataSetMean;
    totalGeometricDeviation += deviation * deviation;
  }
  return Math.sqrt(totalGeometricDeviation / dataSet.length);
};
