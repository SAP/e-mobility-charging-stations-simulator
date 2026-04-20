/** @file Unit tests for resolveOcppVersionFromList */

import assert from 'node:assert'
import { describe, it } from 'node:test'
import { OCPPVersion } from 'ui-common'

import { resolveOcppVersionFromList } from '../src/commands/action.js'

interface StationEntry {
  stationInfo: { hashId: string; ocppVersion?: OCPPVersion }
}

const station = (hashId: string, ocppVersion?: OCPPVersion): StationEntry => ({
  stationInfo: { hashId, ocppVersion },
})

await describe('resolveOcppVersionFromList', async () => {
  await describe('empty station list', async () => {
    await it('returns undefined when list is empty and no hashIds given', () => {
      assert.strictEqual(resolveOcppVersionFromList([], []), undefined)
    })

    await it('returns undefined when list is empty and hashIds are given', () => {
      assert.strictEqual(resolveOcppVersionFromList(['abc'], []), undefined)
    })
  })

  await describe('no hashIds (all stations)', async () => {
    await it('returns the common version when all stations share one version', () => {
      const stations = [
        station('aaa111', OCPPVersion.VERSION_201),
        station('bbb222', OCPPVersion.VERSION_201),
      ]
      assert.strictEqual(resolveOcppVersionFromList([], stations), OCPPVersion.VERSION_201)
    })

    await it('returns undefined when stations have heterogeneous versions', () => {
      const stations = [
        station('aaa111', OCPPVersion.VERSION_16),
        station('bbb222', OCPPVersion.VERSION_201),
      ]
      assert.strictEqual(resolveOcppVersionFromList([], stations), undefined)
    })

    await it('returns undefined when ocppVersion is missing on any station', () => {
      const stations = [station('aaa111', OCPPVersion.VERSION_16), station('bbb222', undefined)]
      assert.strictEqual(resolveOcppVersionFromList([], stations), undefined)
    })

    await it('returns undefined when ocppVersion is missing on all stations', () => {
      const stations = [station('aaa111', undefined), station('bbb222', undefined)]
      assert.strictEqual(resolveOcppVersionFromList([], stations), undefined)
    })
  })

  await describe('hashId filtering', async () => {
    await it('returns version when exact hashId matches', () => {
      const stations = [
        station('aaa111', OCPPVersion.VERSION_16),
        station('bbb222', OCPPVersion.VERSION_201),
      ]
      assert.strictEqual(resolveOcppVersionFromList(['aaa111'], stations), OCPPVersion.VERSION_16)
    })

    await it('matches by prefix', () => {
      const stations = [
        station('aaa111bbbccc', OCPPVersion.VERSION_201),
        station('xxx999', OCPPVersion.VERSION_16),
      ]
      assert.strictEqual(resolveOcppVersionFromList(['aaa'], stations), OCPPVersion.VERSION_201)
    })

    await it('returns undefined when prefix matches no station', () => {
      const stations = [station('aaa111', OCPPVersion.VERSION_16)]
      assert.strictEqual(resolveOcppVersionFromList(['zzz'], stations), undefined)
    })

    await it('returns undefined when matched stations have heterogeneous versions', () => {
      const stations = [
        station('aaa111', OCPPVersion.VERSION_16),
        station('aaa222', OCPPVersion.VERSION_201),
      ]
      assert.strictEqual(resolveOcppVersionFromList(['aaa'], stations), undefined)
    })

    await it('returns common version when multiple hashIds all resolve to same version', () => {
      const stations = [
        station('aaa111', OCPPVersion.VERSION_201),
        station('bbb222', OCPPVersion.VERSION_201),
        station('ccc333', OCPPVersion.VERSION_16),
      ]
      assert.strictEqual(
        resolveOcppVersionFromList(['aaa111', 'bbb222'], stations),
        OCPPVersion.VERSION_201
      )
    })

    await it('returns undefined when matched stations have unknown/missing ocppVersion', () => {
      const stations = [station('aaa111', undefined), station('bbb222', OCPPVersion.VERSION_201)]
      assert.strictEqual(resolveOcppVersionFromList(['aaa111'], stations), undefined)
    })
  })

  await describe('OCPP version values', async () => {
    await it('returns VERSION_16 correctly', () => {
      assert.strictEqual(
        resolveOcppVersionFromList([], [station('a', OCPPVersion.VERSION_16)]),
        OCPPVersion.VERSION_16
      )
    })

    await it('returns VERSION_20 correctly', () => {
      assert.strictEqual(
        resolveOcppVersionFromList([], [station('a', OCPPVersion.VERSION_20)]),
        OCPPVersion.VERSION_20
      )
    })

    await it('returns VERSION_201 correctly', () => {
      assert.strictEqual(
        resolveOcppVersionFromList([], [station('a', OCPPVersion.VERSION_201)]),
        OCPPVersion.VERSION_201
      )
    })
  })
})
