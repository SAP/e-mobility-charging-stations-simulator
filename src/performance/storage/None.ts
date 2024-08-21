// Copyright Jerome Benoit. 2021-2024. All Rights Reserved.

import type { Statistics } from '../../types/index.js'

import { Storage } from './Storage.js'

export class None extends Storage {
  constructor () {
    super('none://none', 'none')
  }

  public close (): void {
    this.clearPerformanceStatistics()
  }

  public open (): void {
    /** Intentionally empty */
  }

  public storePerformanceStatistics (performanceStatistics: Statistics): void {
    this.setPerformanceStatistics(performanceStatistics)
  }
}
