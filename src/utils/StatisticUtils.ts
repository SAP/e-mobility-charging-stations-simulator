import { isEmptyArray } from './Utils.js'

/**
 * Computes the average of the given data set.
 *
 * @param dataSet - Data set.
 * @returns The average of the given data set.
 * @internal
 */
export const average = (dataSet: number[]): number => {
  if (Array.isArray(dataSet) && dataSet.length === 0) {
    return 0
  }
  if (Array.isArray(dataSet) && dataSet.length === 1) {
    return dataSet[0]
  }
  return dataSet.reduce((accumulator, nb) => accumulator + nb, 0) / dataSet.length
}

/**
 * Computes the median of the given data set.
 *
 * @param dataSet - Data set.
 * @returns The median of the given data set.
 * @internal
 */
export const median = (dataSet: number[]): number => {
  if (isEmptyArray(dataSet)) {
    return 0
  }
  if (Array.isArray(dataSet) && dataSet.length === 1) {
    return dataSet[0]
  }
  const sortedDataSet = dataSet.slice().sort((a, b) => a - b)
  return (
    (sortedDataSet[(sortedDataSet.length - 1) >> 1] + sortedDataSet[sortedDataSet.length >> 1]) / 2
  )
}

// TODO: use order statistics tree https://en.wikipedia.org/wiki/Order_statistic_tree
export const nthPercentile = (dataSet: number[], percentile: number): number => {
  if (percentile < 0 && percentile > 100) {
    throw new RangeError('Percentile is not between 0 and 100')
  }
  if (isEmptyArray(dataSet)) {
    return 0
  }
  const sortedDataSet = dataSet.slice().sort((a, b) => a - b)
  if (percentile === 0 || sortedDataSet.length === 1) {
    return sortedDataSet[0]
  }
  if (percentile === 100) {
    return sortedDataSet[sortedDataSet.length - 1]
  }
  const percentileIndexBase = (percentile / 100) * (sortedDataSet.length - 1)
  const percentileIndexInteger = Math.floor(percentileIndexBase)
  if (sortedDataSet[percentileIndexInteger + 1] != null) {
    return (
      sortedDataSet[percentileIndexInteger] +
      (percentileIndexBase - percentileIndexInteger) *
        (sortedDataSet[percentileIndexInteger + 1] - sortedDataSet[percentileIndexInteger])
    )
  }
  return sortedDataSet[percentileIndexInteger]
}

/**
 * Computes the sample standard deviation of the given data set.
 *
 * @param dataSet - Data set.
 * @param dataSetAverage - Average of the data set.
 * @returns The sample standard deviation of the given data set.
 * @see https://en.wikipedia.org/wiki/Unbiased_estimation_of_standard_deviation
 * @internal
 */
export const stdDeviation = (
  dataSet: number[],
  dataSetAverage: number = average(dataSet)
): number => {
  if (isEmptyArray(dataSet)) {
    return 0
  }
  if (Array.isArray(dataSet) && dataSet.length === 1) {
    return 0
  }
  return Math.sqrt(
    dataSet.reduce((accumulator, num) => accumulator + Math.pow(num - dataSetAverage, 2), 0) /
      (dataSet.length - 1)
  )
}
