// Copyright Jerome Benoit. 2021-2024. All Rights Reserved.

import { Storage } from './Storage.js'
import type { Statistics } from '../../types/index.js'

export class None extends Storage {
  constructor () {
    super('none://none', 'none')
  }

  public storePerformanceStatistics (performanceStatistics: Statistics): void {
    this.setPerformanceStatistics(performanceStatistics)
  }

  public open (): void {
    /** Intentionally empty   */
  }

  public close (): void {
    this.clearPerformanceStatistics()
  }
}
