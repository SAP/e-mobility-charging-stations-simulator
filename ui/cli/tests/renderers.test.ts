import assert from 'node:assert'
import { describe, it } from 'node:test'
import { OCPP16AvailabilityType, OCPP16ChargePointStatus, ResponseStatus } from 'ui-common'

import { tryRenderPayload } from '../src/output/renderers.js'
import { captureStream } from './helpers.js'

const stationListPayload = {
  chargingStations: [
    {
      connectors: [
        {
          connectorId: 1,
          connectorStatus: {
            availability: OCPP16AvailabilityType.OPERATIVE,
            status: OCPP16ChargePointStatus.AVAILABLE,
          },
        },
      ],
      evses: [],
      started: true,
      stationInfo: {
        chargingStationId: 'CS-001',
        hashId: 'abcdef123456789012345678',
        ocppVersion: '2.0.1',
        templateName: 'test.station-template',
      },
      wsState: 1,
    },
  ],
  status: ResponseStatus.SUCCESS,
}

const simulatorStatePayload = {
  state: {
    configuration: {
      supervisionUrls: ['ws://localhost:8180'],
      worker: { elementsPerWorker: 'all', processType: 'workerSet' },
    },
    started: true,
    templateStatistics: {
      'test.station-template': {
        added: 2,
        configured: 1,
        indexes: [0, 1],
        provisioned: 0,
        started: 2,
      },
    },
    version: '4.0.0',
  },
  status: ResponseStatus.SUCCESS,
}

await describe('renderers', async () => {
  await describe('tryRenderPayload dispatch', async () => {
    await it('returns false for payload without known keys', () => {
      const result = tryRenderPayload({ status: ResponseStatus.SUCCESS })
      assert.strictEqual(result, false)
    })

    await it('returns true for station list payload', () => {
      let result = false
      captureStream('stdout', () => {
        result = tryRenderPayload(stationListPayload)
      })
      assert.strictEqual(result, true)
    })

    await it('returns true for template list payload', () => {
      let result = false
      captureStream('stdout', () => {
        result = tryRenderPayload({
          status: ResponseStatus.SUCCESS,
          templates: ['template-a', 'template-b'],
        })
      })
      assert.strictEqual(result, true)
    })

    await it('returns true for simulator state payload', () => {
      let result = false
      captureStream('stdout', () => {
        result = tryRenderPayload(simulatorStatePayload)
      })
      assert.strictEqual(result, true)
    })

    await it('returns true for performance stats payload', () => {
      let result = false
      captureStream('stdout', () => {
        result = tryRenderPayload({ performanceStatistics: [], status: ResponseStatus.SUCCESS })
      })
      assert.strictEqual(result, true)
    })
  })

  await describe('type guard specifics', async () => {
    await it('isStationList rejects non-array chargingStations', () => {
      const result = tryRenderPayload({
        chargingStations: 'not-array',
        status: ResponseStatus.SUCCESS,
      })
      assert.strictEqual(result, false)
    })

    await it('isTemplateList rejects non-array templates', () => {
      const result = tryRenderPayload({ status: ResponseStatus.SUCCESS, templates: 'not-array' })
      assert.strictEqual(result, false)
    })

    await it('isPerformanceStats rejects non-array performanceStatistics', () => {
      const result = tryRenderPayload({
        performanceStatistics: 'not-array',
        status: ResponseStatus.SUCCESS,
      })
      assert.strictEqual(result, false)
    })

    await it('isSimulatorState rejects state without version', () => {
      const result = tryRenderPayload({
        state: {
          configuration: {},
          started: true,
          templateStatistics: {},
        },
        status: ResponseStatus.SUCCESS,
      })
      assert.strictEqual(result, false)
    })

    await it('isSimulatorState rejects state without templateStatistics', () => {
      const result = tryRenderPayload({
        state: {
          configuration: {},
          started: true,
          version: '1.0.0',
        },
        status: ResponseStatus.SUCCESS,
      })
      assert.strictEqual(result, false)
    })

    await it('isSimulatorState accepts state without configuration', () => {
      const output = captureStream('stdout', () => {
        const result = tryRenderPayload({
          state: {
            started: true,
            templateStatistics: {},
            version: '1.0.0',
          },
          status: ResponseStatus.SUCCESS,
        })
        assert.strictEqual(result, true)
      })
      assert.ok(output.includes('1.0.0'))
    })

    await it('isSimulatorState rejects null state', () => {
      const result = tryRenderPayload({ state: null, status: ResponseStatus.SUCCESS })
      assert.strictEqual(result, false)
    })

    await it('isSimulatorState rejects non-object state (string)', () => {
      const result = tryRenderPayload({ state: 'not-an-object', status: ResponseStatus.SUCCESS })
      assert.strictEqual(result, false)
    })
  })

  await describe('renderStationList', async () => {
    await it('renders empty message for empty array', () => {
      const output = captureStream('stdout', () => {
        tryRenderPayload({ chargingStations: [], status: ResponseStatus.SUCCESS })
      })
      assert.ok(output.includes('No charging stations'))
    })

    await it('renders table with station name', () => {
      const output = captureStream('stdout', () => {
        tryRenderPayload(stationListPayload)
      })
      assert.ok(output.includes('CS-001'))
    })

    await it('renders table with truncated hash id', () => {
      const output = captureStream('stdout', () => {
        tryRenderPayload(stationListPayload)
      })
      assert.ok(output.includes('abcdef123456'))
    })

    await it('renders footer with station count', () => {
      const output = captureStream('stdout', () => {
        tryRenderPayload(stationListPayload)
      })
      assert.ok(output.includes('1 station'))
    })

    await it('renders footer with started and connected counts', () => {
      const output = captureStream('stdout', () => {
        tryRenderPayload(stationListPayload)
      })
      assert.ok(output.includes('started'))
      assert.ok(output.includes('connected'))
    })
  })

  await describe('renderTemplateList', async () => {
    await it('renders one template per line', () => {
      const output = captureStream('stdout', () => {
        tryRenderPayload({
          status: ResponseStatus.SUCCESS,
          templates: ['template-a', 'template-b'],
        })
      })
      assert.ok(output.includes('template-a'))
      assert.ok(output.includes('template-b'))
    })

    await it('renders footer count', () => {
      const output = captureStream('stdout', () => {
        tryRenderPayload({
          status: ResponseStatus.SUCCESS,
          templates: ['template-a', 'template-b'],
        })
      })
      assert.ok(output.includes('2 templates'))
    })

    await it('renders singular footer for single template', () => {
      const output = captureStream('stdout', () => {
        tryRenderPayload({ status: ResponseStatus.SUCCESS, templates: ['only-one'] })
      })
      assert.ok(output.includes('1 template'))
      assert.ok(!output.includes('1 templates'))
    })

    await it('renders empty message for empty array', () => {
      const output = captureStream('stdout', () => {
        tryRenderPayload({ status: ResponseStatus.SUCCESS, templates: [] })
      })
      assert.ok(output.includes('No templates available'))
    })
  })

  await describe('renderSimulatorState', async () => {
    await it('renders version', () => {
      const output = captureStream('stdout', () => {
        tryRenderPayload(simulatorStatePayload)
      })
      assert.ok(output.includes('4.0.0'))
    })

    await it('renders started status', () => {
      const output = captureStream('stdout', () => {
        tryRenderPayload(simulatorStatePayload)
      })
      assert.ok(output.includes('started'))
    })

    await it('renders template statistics table', () => {
      const output = captureStream('stdout', () => {
        tryRenderPayload(simulatorStatePayload)
      })
      assert.ok(output.includes('test'))
    })

    await it('renders footer with station counts', () => {
      const output = captureStream('stdout', () => {
        tryRenderPayload(simulatorStatePayload)
      })
      assert.ok(output.includes('2 stations'))
    })

    await it('renders worker info when present', () => {
      const output = captureStream('stdout', () => {
        tryRenderPayload(simulatorStatePayload)
      })
      assert.ok(output.includes('workerSet'))
    })

    await it('renders supervision URL when present', () => {
      const output = captureStream('stdout', () => {
        tryRenderPayload(simulatorStatePayload)
      })
      assert.ok(output.includes('ws://localhost:8180'))
    })

    await it('renders stopped status when started is false', () => {
      const stoppedPayload = {
        state: {
          ...simulatorStatePayload.state,
          started: false,
        },
        status: ResponseStatus.SUCCESS,
      }
      const output = captureStream('stdout', () => {
        tryRenderPayload(stoppedPayload)
      })
      assert.ok(output.includes('stopped'))
    })
  })

  await describe('renderPerformanceStats', async () => {
    await it('renders empty message for empty array', () => {
      const output = captureStream('stdout', () => {
        tryRenderPayload({ performanceStatistics: [], status: ResponseStatus.SUCCESS })
      })
      assert.ok(output.includes('No performance statistics collected'))
    })

    await it('renders JSON for non-empty stats array', () => {
      const stats = [{ id: 'cs-001', measurements: {} }]
      const output = captureStream('stdout', () => {
        tryRenderPayload({ performanceStatistics: stats, status: ResponseStatus.SUCCESS })
      })
      assert.ok(output.includes('cs-001'))
    })
  })
})
