/**
 * @file Tests for v2 dialogs (Add / SetSupervisionUrl / StartTransaction / Authorize)
 * @description Form interaction, payload shaping, error display, navigation.
 *   Modal is mocked to skip the Teleport so wrapper.find() reaches dialog inputs.
 */
import { flushPromises, mount } from '@vue/test-utils'
import { ResponseStatus, ServerFailureError } from 'ui-common'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, ref } from 'vue'

import { chargingStationsKey, templatesKey, uiClientKey } from '@/composables'

// Mock Modal to render slots inline (no Teleport), so `wrapper.find()` works.
vi.mock('@/v2/components/Modal.vue', () => ({
  default: defineComponent({
    emits: ['close'],
    name: 'V2ModalStub',
    props: { closeOnBackdrop: { default: true, type: Boolean }, title: { required: true, type: String } },
    template:
      '<div class="stub-modal"><h2>{{ title }}</h2><div class="stub-modal__body"><slot /></div><div class="stub-modal__foot"><slot name="footer" /></div></div>',
  }),
}))

import AddStationsDialog from '@/v2/components/dialogs/AddStationsDialog.vue'
import AuthorizeDialog from '@/v2/components/dialogs/AuthorizeDialog.vue'
import SetSupervisionUrlDialog from '@/v2/components/dialogs/SetSupervisionUrlDialog.vue'
import StartTransactionDialog from '@/v2/components/dialogs/StartTransactionDialog.vue'

import { toastMock } from '../../setup'
import { createChargingStationData, TEST_HASH_ID, TEST_STATION_ID } from '../constants'
import { createMockUIClient, type MockUIClient } from '../helpers'

vi.mock('vue-router', async importOriginal => {
  const actual: Record<string, unknown> = await importOriginal()
  return {
    ...actual,
    useRoute: vi.fn().mockReturnValue({ name: 'v2-charging-stations', query: {} }),
    useRouter: vi.fn(),
  }
})

import { useRoute, useRouter } from 'vue-router'

let mockClient: MockUIClient
let mockRouter: { push: ReturnType<typeof vi.fn> }

beforeEach(() => {
  mockClient = createMockUIClient()
  mockRouter = { push: vi.fn().mockResolvedValue(undefined) }
  vi.mocked(useRouter).mockReturnValue(mockRouter as unknown as ReturnType<typeof useRouter>)
  vi.mocked(useRoute).mockReturnValue({
    name: 'v2-charging-stations',
    query: {},
  } as unknown as ReturnType<typeof useRoute>)
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('v2 AddStationsDialog', () => {
  /**
   * @param templates template list provided via injection
   * @returns mounted wrapper
   */
  function mountDialog (templates = ['template-A.json', 'template-B.json']) {
    return mount(AddStationsDialog, {
      global: {
        provide: {
          [templatesKey as symbol]: ref(templates),
          [uiClientKey as symbol]: mockClient,
        },
      },
    })
  }

  it('renders template options', () => {
    const wrapper = mountDialog()
    expect(wrapper.text()).toContain('template-A.json')
    expect(wrapper.text()).toContain('template-B.json')
  })

  it('rejects submission when no template is selected', async () => {
    const wrapper = mountDialog()
    // Footer: button 0 = Cancel, button 1 = Add
    await wrapper.findAll('.stub-modal__foot button')[1].trigger('click')
    await flushPromises()
    expect(toastMock.error).toHaveBeenCalled()
    expect(mockClient.addChargingStations).not.toHaveBeenCalled()
  })

  it('rejects submission when numberOfStations < 1', async () => {
    const wrapper = mountDialog()
    await wrapper.find('#v2-add-template').setValue('template-A.json')
    await wrapper.find('#v2-add-count').setValue(0)
    await wrapper.findAll('.stub-modal__foot button')[1].trigger('click')
    await flushPromises()
    expect(toastMock.error).toHaveBeenCalled()
    expect(mockClient.addChargingStations).not.toHaveBeenCalled()
  })

  it('submits minimal payload on success and navigates home', async () => {
    const wrapper = mountDialog()
    await wrapper.find('#v2-add-template').setValue('template-A.json')
    await wrapper.findAll('.stub-modal__foot button')[1].trigger('click')
    await flushPromises()
    expect(mockClient.addChargingStations).toHaveBeenCalledWith(
      'template-A.json',
      1,
      expect.objectContaining({
        autoStart: false,
        baseName: undefined,
        fixedName: undefined,
        supervisionPassword: undefined,
        supervisionUrls: undefined,
        supervisionUser: undefined,
      })
    )
    expect(toastMock.success).toHaveBeenCalled()
    expect(mockRouter.push).toHaveBeenCalledWith({ name: 'v2-charging-stations' })
  })

  it('sends fixedName=true when baseName set and checkbox checked', async () => {
    const wrapper = mountDialog()
    await wrapper.find('#v2-add-template').setValue('template-A.json')
    const textInputs = wrapper.findAll('input[type="text"]')
    await textInputs[0].setValue('MY-BASE')
    const checkboxes = wrapper.findAll('input[type="checkbox"]')
    await checkboxes[0].setValue(true)
    await wrapper.findAll('.stub-modal__foot button')[1].trigger('click')
    await flushPromises()
    expect(mockClient.addChargingStations).toHaveBeenCalledWith(
      'template-A.json',
      1,
      expect.objectContaining({ baseName: 'MY-BASE', fixedName: true })
    )
  })

  it('passes supervision url and credentials when filled', async () => {
    const wrapper = mountDialog()
    await wrapper.find('#v2-add-template').setValue('template-A.json')
    await wrapper.find('input[type="url"]').setValue('wss://example.com/ocpp')
    const textInputs = wrapper.findAll('input[type="text"]')
    await textInputs[1].setValue('alice')
    await wrapper.find('input[type="password"]').setValue('s3cret')
    await wrapper.findAll('.stub-modal__foot button')[1].trigger('click')
    await flushPromises()
    expect(mockClient.addChargingStations).toHaveBeenCalledWith(
      'template-A.json',
      1,
      expect.objectContaining({
        supervisionPassword: 's3cret',
        supervisionUrls: 'wss://example.com/ocpp',
        supervisionUser: 'alice',
      })
    )
  })

  it('shows error toast on failure', async () => {
    const wrapper = mountDialog()
    mockClient.addChargingStations = vi.fn().mockRejectedValue(new Error('nope'))
    await wrapper.find('#v2-add-template').setValue('template-A.json')
    await wrapper.findAll('.stub-modal__foot button')[1].trigger('click')
    await flushPromises()
    expect(toastMock.error).toHaveBeenCalled()
  })

  it('Cancel button closes via router', async () => {
    const wrapper = mountDialog()
    await wrapper.findAll('.stub-modal__foot button')[0].trigger('click')
    await flushPromises()
    expect(mockRouter.push).toHaveBeenCalledWith({ name: 'v2-charging-stations' })
  })
})

describe('v2 SetSupervisionUrlDialog', () => {
  /**
   * @param stations charging-station fixtures for injection
   * @returns mounted wrapper
   */
  function mountDialog (stations = [createChargingStationData()]) {
    return mount(SetSupervisionUrlDialog, {
      global: {
        provide: {
          [chargingStationsKey as symbol]: ref(stations),
          [uiClientKey as symbol]: mockClient,
        },
      },
      props: { chargingStationId: TEST_STATION_ID, hashId: TEST_HASH_ID },
    })
  }

  it('prefills URL stripped of trailing /chargingStationId', () => {
    const wrapper = mountDialog([
      createChargingStationData({
        supervisionUrl: `wss://host:9000/${TEST_STATION_ID}`,
      }),
    ])
    const input = wrapper.find<HTMLInputElement>('#v2-sup-url').element
    expect(input.value).toBe('wss://host:9000')
  })

  it('prefills username and password from stationInfo', () => {
    const wrapper = mountDialog([
      createChargingStationData({
        stationInfo: {
          baseName: 'CS',
          chargePointModel: 'm',
          chargePointVendor: 'v',
          chargingStationId: TEST_STATION_ID,
          hashId: TEST_HASH_ID,
          supervisionPassword: 'pw',
          supervisionUser: 'u',
          templateIndex: 0,
          templateName: 't',
        },
        supervisionUrl: `wss://host/${TEST_STATION_ID}`,
      }),
    ])
    const user = wrapper.find<HTMLInputElement>('#v2-sup-user').element
    const pass = wrapper.find<HTMLInputElement>('#v2-sup-pass').element
    expect(user.value).toBe('u')
    expect(pass.value).toBe('pw')
  })

  it('falls back to empty strings when station not found', () => {
    const wrapper = mountDialog([])
    const input = wrapper.find<HTMLInputElement>('#v2-sup-url').element
    expect(input.value).toBe('')
  })

  it('rejects submission when URL is empty', async () => {
    const wrapper = mountDialog([])
    await wrapper.findAll('.stub-modal__foot button')[1].trigger('click')
    await flushPromises()
    expect(toastMock.error).toHaveBeenCalled()
    expect(mockClient.setSupervisionUrl).not.toHaveBeenCalled()
  })

  it('sends credentials verbatim and reconnects when station is started', async () => {
    const wrapper = mountDialog([
      createChargingStationData({
        started: true,
        supervisionUrl: `wss://host/${TEST_STATION_ID}`,
      }),
    ])
    await wrapper.find('#v2-sup-url').setValue('wss://new.example.com')
    await wrapper.find('#v2-sup-user').setValue('alice')
    await wrapper.find('#v2-sup-pass').setValue('pw')
    await wrapper.findAll('.stub-modal__foot button')[1].trigger('click')
    await flushPromises()
    expect(mockClient.setSupervisionUrl).toHaveBeenCalledWith(
      TEST_HASH_ID,
      'wss://new.example.com',
      'alice',
      'pw'
    )
    expect(mockClient.closeConnection).toHaveBeenCalledWith(TEST_HASH_ID)
    expect(mockClient.openConnection).toHaveBeenCalledWith(TEST_HASH_ID)
    expect(toastMock.success).toHaveBeenCalled()
    expect(mockRouter.push).toHaveBeenCalledWith({ name: 'v2-charging-stations' })
  })

  it('does not reconnect when station is stopped', async () => {
    const wrapper = mountDialog([
      createChargingStationData({
        started: false,
        supervisionUrl: `wss://host/${TEST_STATION_ID}`,
      }),
    ])
    await wrapper.find('#v2-sup-url').setValue('wss://new.example.com')
    await wrapper.findAll('.stub-modal__foot button')[1].trigger('click')
    await flushPromises()
    expect(mockClient.setSupervisionUrl).toHaveBeenCalled()
    expect(mockClient.closeConnection).not.toHaveBeenCalled()
    expect(mockClient.openConnection).not.toHaveBeenCalled()
  })

  it('skips reconnect when checkbox is unchecked', async () => {
    const wrapper = mountDialog([
      createChargingStationData({
        started: true,
        supervisionUrl: `wss://host/${TEST_STATION_ID}`,
      }),
    ])
    await wrapper.find('#v2-sup-url').setValue('wss://new.example.com')
    const reconnectBox = wrapper.find<HTMLInputElement>('input[type="checkbox"]')
    await reconnectBox.setValue(false)
    await wrapper.findAll('.stub-modal__foot button')[1].trigger('click')
    await flushPromises()
    expect(mockClient.closeConnection).not.toHaveBeenCalled()
    expect(mockClient.openConnection).not.toHaveBeenCalled()
  })

  it('toasts error on failure', async () => {
    const wrapper = mountDialog([
      createChargingStationData({ supervisionUrl: `wss://host/${TEST_STATION_ID}` }),
    ])
    mockClient.setSupervisionUrl = vi.fn().mockRejectedValue(new Error('boom'))
    await wrapper.findAll('.stub-modal__foot button')[1].trigger('click')
    await flushPromises()
    expect(toastMock.error).toHaveBeenCalled()
  })

  it('Cancel button closes via router', async () => {
    const wrapper = mountDialog([])
    await wrapper.findAll('.stub-modal__foot button')[0].trigger('click')
    await flushPromises()
    expect(mockRouter.push).toHaveBeenCalledWith({ name: 'v2-charging-stations' })
  })
})

describe('v2 StartTransactionDialog', () => {
  /**
   * @param routeQuery route-query overrides applied to useRoute mock
   * @returns mounted wrapper
   */
  function mountDialog (routeQuery: Record<string, string> = {}) {
    vi.mocked(useRoute).mockReturnValue({
      name: 'v2-start-transaction',
      query: routeQuery,
    } as unknown as ReturnType<typeof useRoute>)
    return mount(StartTransactionDialog, {
      global: { provide: { [uiClientKey as symbol]: mockClient } },
      props: {
        chargingStationId: TEST_STATION_ID,
        connectorId: '1',
        hashId: TEST_HASH_ID,
      },
    })
  }

  it('rejects authorize-first when no idTag provided', async () => {
    const wrapper = mountDialog()
    await wrapper.findAll('.stub-modal__foot button')[1].trigger('click')
    await flushPromises()
    expect(toastMock.error).toHaveBeenCalled()
    expect(mockClient.authorize).not.toHaveBeenCalled()
    expect(mockClient.startTransaction).not.toHaveBeenCalled()
  })

  it('authorizes then starts transaction when authorize-first checked', async () => {
    const wrapper = mountDialog()
    await wrapper.find('#v2-tx-idtag').setValue('RFID-01')
    await wrapper.findAll('.stub-modal__foot button')[1].trigger('click')
    await flushPromises()
    expect(mockClient.authorize).toHaveBeenCalledWith(TEST_HASH_ID, 'RFID-01')
    expect(mockClient.startTransaction).toHaveBeenCalledWith(
      TEST_HASH_ID,
      expect.objectContaining({ connectorId: 1, idTag: 'RFID-01' })
    )
    expect(toastMock.success).toHaveBeenCalled()
  })

  it('skips authorize when checkbox is unchecked', async () => {
    const wrapper = mountDialog()
    const checkbox = wrapper.find<HTMLInputElement>('input[type="checkbox"]')
    await checkbox.setValue(false)
    await wrapper.findAll('.stub-modal__foot button')[1].trigger('click')
    await flushPromises()
    expect(mockClient.authorize).not.toHaveBeenCalled()
    expect(mockClient.startTransaction).toHaveBeenCalled()
  })

  it('includes evseId and ocppVersion from route query', async () => {
    const wrapper = mountDialog({ evseId: '2', ocppVersion: '1.6' })
    await wrapper.find('#v2-tx-idtag').setValue('RFID-01')
    await wrapper.findAll('.stub-modal__foot button')[1].trigger('click')
    await flushPromises()
    expect(mockClient.startTransaction).toHaveBeenCalledWith(
      TEST_HASH_ID,
      expect.objectContaining({ evseId: 2, ocppVersion: '1.6' })
    )
    expect(wrapper.text()).toContain('EVSE 2')
  })

  it('shows Connector-only target label when no evseId', () => {
    const wrapper = mountDialog()
    expect(wrapper.text()).toContain('Connector 1')
    expect(wrapper.text()).not.toContain('EVSE')
  })

  it('displays failure info from ServerFailureError', async () => {
    const wrapper = mountDialog()
    mockClient.authorize = vi.fn().mockRejectedValue(
      new ServerFailureError({
        hashIdsFailed: [],
        responsesFailed: [
          {
            commandResponse: { idTagInfo: { status: 'Invalid' } },
            hashId: TEST_HASH_ID,
            status: ResponseStatus.FAILURE,
          },
        ],
        status: ResponseStatus.FAILURE,
      } as never)
    )
    await wrapper.find('#v2-tx-idtag').setValue('BAD-TAG')
    await wrapper.findAll('.stub-modal__foot button')[1].trigger('click')
    await flushPromises()
    expect(toastMock.error).toHaveBeenCalledWith(
      expect.stringContaining('Authorize failed: Invalid')
    )
    expect(wrapper.text()).toContain('Authorize failed')
    expect(wrapper.text()).toContain('Invalid')
  })

  it('labels failures during startTransaction step', async () => {
    const wrapper = mountDialog()
    mockClient.startTransaction = vi.fn().mockRejectedValue(new Error('tx failed'))
    await wrapper.find('#v2-tx-idtag').setValue('RFID')
    await wrapper.findAll('.stub-modal__foot button')[1].trigger('click')
    await flushPromises()
    expect(toastMock.error).toHaveBeenCalledWith(
      expect.stringContaining('Start transaction failed')
    )
  })

  it('Cancel button closes via router', async () => {
    const wrapper = mountDialog()
    await wrapper.findAll('.stub-modal__foot button')[0].trigger('click')
    await flushPromises()
    expect(mockRouter.push).toHaveBeenCalledWith({ name: 'v2-charging-stations' })
  })
})

describe('v2 AuthorizeDialog', () => {
  /** @returns mounted wrapper */
  function mountDialog () {
    return mount(AuthorizeDialog, {
      global: { provide: { [uiClientKey as symbol]: mockClient } },
      props: { chargingStationId: TEST_STATION_ID, hashId: TEST_HASH_ID },
    })
  }

  it('rejects when idTag is empty', async () => {
    const wrapper = mountDialog()
    await wrapper.findAll('.stub-modal__foot button')[1].trigger('click')
    await flushPromises()
    expect(toastMock.error).toHaveBeenCalled()
    expect(mockClient.authorize).not.toHaveBeenCalled()
  })

  it('calls authorize and navigates on success', async () => {
    const wrapper = mountDialog()
    await wrapper.find('#v2-auth-tag').setValue('GOOD')
    await wrapper.findAll('.stub-modal__foot button')[1].trigger('click')
    await flushPromises()
    expect(mockClient.authorize).toHaveBeenCalledWith(TEST_HASH_ID, 'GOOD')
    expect(toastMock.success).toHaveBeenCalled()
    expect(mockRouter.push).toHaveBeenCalledWith({ name: 'v2-charging-stations' })
  })

  it('surfaces ServerFailureError status and payload JSON panel', async () => {
    const wrapper = mountDialog()
    mockClient.authorize = vi.fn().mockRejectedValue(
      new ServerFailureError({
        hashIdsFailed: [],
        responsesFailed: [
          {
            commandResponse: { idTagInfo: { status: 'Blocked' } },
            hashId: TEST_HASH_ID,
            status: ResponseStatus.FAILURE,
          },
        ],
        status: ResponseStatus.FAILURE,
      } as never)
    )
    await wrapper.find('#v2-auth-tag').setValue('BAD')
    await wrapper.findAll('.stub-modal__foot button')[1].trigger('click')
    await flushPromises()
    expect(toastMock.error).toHaveBeenCalledWith(
      expect.stringContaining('Authorize failed: Blocked')
    )
    expect(wrapper.text()).toContain('Blocked')
    expect(wrapper.find('.v2-form__error-details').exists()).toBe(true)
  })

  it('Cancel closes via router', async () => {
    const wrapper = mountDialog()
    await wrapper.findAll('.stub-modal__foot button')[0].trigger('click')
    await flushPromises()
    expect(mockRouter.push).toHaveBeenCalledWith({ name: 'v2-charging-stations' })
  })
})
