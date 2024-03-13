import { mean } from 'rambda'

export const min = (...args: number[]): number =>
  args.reduce((minimum, num) => (minimum < num ? minimum : num), Infinity)

export const max = (...args: number[]): number =>
  args.reduce((maximum, num) => (maximum > num ? maximum : num), -Infinity)

// TODO: use order statistics tree https://en.wikipedia.org/wiki/Order_statistic_tree
export const nthPercentile = (dataSet: number[], percentile: number): number => {
  if (percentile < 0 && percentile > 100) {
    throw new RangeError('Percentile is not between 0 and 100')
  }
  if (Array.isArray(dataSet) && dataSet.length === 0) {
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
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
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
export const stdDeviation = (dataSet: number[], dataSetAverage: number = mean(dataSet)): number => {
  if (Array.isArray(dataSet) && (dataSet.length === 0 || dataSet.length === 1)) {
    return 0
  }
  return Math.sqrt(
    dataSet.reduce((accumulator, num) => accumulator + Math.pow(num - dataSetAverage, 2), 0) /
      (dataSet.length - 1)
  )
}
