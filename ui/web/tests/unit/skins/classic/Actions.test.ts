/**
 * @file Tests for classic action components
 * @description Unit tests for classic skin action components: AddChargingStations, SetSupervisionUrl, StartTransaction.
 */
import { flushPromises, mount } from '@vue/test-utils'
import { type ConfigurationKey, OCPPVersion } from 'ui-common'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref, shallowRef } from 'vue'

import {
  chargingStationsKey,
  configurationKey,
  EMPTY_VALUE_PLACEHOLDER,
  MASKED_VALUE_PLACEHOLDER,
  templatesKey,
  uiClientKey,
} from '@/core/index.js'
import AddChargingStations from '@/skins/classic/components/actions/AddChargingStations.vue'
import ChangeConfiguration from '@/skins/classic/components/actions/ChangeConfiguration.vue'
import SetSupervisionUrl from '@/skins/classic/components/actions/SetSupervisionUrl.vue'
import ShowDetails from '@/skins/classic/components/actions/ShowDetails.vue'
import StartTransaction from '@/skins/classic/components/actions/StartTransaction.vue'

import { toastMock } from '../../../setup.js'
import {
  createChargingStationData,
  createStationInfo,
  createUIServerConfig,
  TEST_HASH_ID,
  TEST_STATION_ID,
} from '../../constants.js'
import { ButtonStub, createMockUIClient, type MockUIClient } from '../../helpers.js'

const mockPush = vi.fn().mockResolvedValue(undefined)
const mockRoute = ref<{
  name: string
  params: Record<string, string>
  query: Record<string, string>
}>({
  name: 'start-transaction',
  params: { chargingStationId: TEST_STATION_ID, connectorId: '1', hashId: TEST_HASH_ID },
  query: { evseId: '1', ocppVersion: '1.6' },
})

vi.mock('vue-router', () => ({
  useRoute: () => mockRoute.value,
  useRouter: () => ({
    push: mockPush,
  }),
}))

let mockClient: MockUIClient

/** @returns Provide object for component mounting */
function createProvide () {
  return {
    [chargingStationsKey as symbol]: shallowRef([]),
    [configurationKey as symbol]: shallowRef({ uiServer: [createUIServerConfig()] }),
    [templatesKey as symbol]: shallowRef(['template-a.json', 'template-b.json']),
    [uiClientKey as symbol]: mockClient,
  }
}

describe('Actions', () => {
  describe('AddChargingStations', () => {
    beforeEach(() => {
      mockClient = createMockUIClient()
      mockPush.mockClear()
    })

    afterEach(() => {
      vi.clearAllMocks()
      vi.restoreAllMocks()
    })

    /** @returns Mounted AddChargingStations wrapper */
    function mountAdd () {
      return mount(AddChargingStations, {
        global: {
          provide: createProvide(),
          stubs: {
            Button: ButtonStub,
          },
        },
      })
    }

    it('should render the heading', () => {
      const wrapper = mountAdd()
      expect(wrapper.find('h1').text()).toBe('Add Charging Stations')
    })

    it('should render template select with options', () => {
      const wrapper = mountAdd()
      const options = wrapper.findAll('option')
      expect(options.length).toBeGreaterThanOrEqual(3)
      expect(options[1].text()).toBe('template-a.json')
      expect(options[2].text()).toBe('template-b.json')
    })

    it('should render number of stations input', () => {
      const wrapper = mountAdd()
      const input = wrapper.find('input[name="number-of-stations"]')
      expect(input.exists()).toBe(true)
    })

    it('should render template options fields', () => {
      const wrapper = mountAdd()
      expect(wrapper.find('input[name="base-name"]').exists()).toBe(true)
      expect(wrapper.find('input[name="supervision-url"]').exists()).toBe(true)
      expect(wrapper.find('input[name="supervision-user"]').exists()).toBe(true)
      expect(wrapper.find('input[name="supervision-password"]').exists()).toBe(true)
    })

    it('should call addChargingStations on submit', async () => {
      const wrapper = mountAdd()
      const select = wrapper.find('select')
      await select.setValue('template-a.json')
      const numInput = wrapper.find('input[name="number-of-stations"]')
      await numInput.setValue(2)
      const submitBtn = wrapper.findComponent(ButtonStub)
      await submitBtn.trigger('click')
      await flushPromises()
      expect(mockClient.addChargingStations).toHaveBeenCalledWith(
        'template-a.json',
        2,
        expect.objectContaining({
          autoStart: false,
          ocppStrictCompliance: true,
          persistentConfiguration: true,
        })
      )
    })

    it('should navigate to charging-stations after submit', async () => {
      const wrapper = mountAdd()
      const select = wrapper.find('select')
      await select.setValue('template-a.json')
      const submitBtn = wrapper.findComponent(ButtonStub)
      await submitBtn.trigger('click')
      await flushPromises()
      expect(mockPush).toHaveBeenCalledWith({ name: 'charging-stations' })
    })

    it('should toast success on successful add', async () => {
      const wrapper = mountAdd()
      const select = wrapper.find('select')
      await select.setValue('template-b.json')
      const submitBtn = wrapper.findComponent(ButtonStub)
      await submitBtn.trigger('click')
      await flushPromises()
      expect(toastMock.success).toHaveBeenCalledWith('Charging stations successfully added')
    })

    it('should toast error on failed add', async () => {
      mockClient.addChargingStations = vi.fn().mockRejectedValue(new Error('fail'))
      const wrapper = mountAdd()
      const select = wrapper.find('select')
      await select.setValue('template-a.json')
      const submitBtn = wrapper.findComponent(ButtonStub)
      await submitBtn.trigger('click')
      await flushPromises()
      expect(toastMock.error).toHaveBeenCalledWith('Error at adding charging stations')
    })
  })

  describe('SetSupervisionUrl', () => {
    beforeEach(() => {
      mockClient = createMockUIClient()
      mockPush.mockClear()
    })

    afterEach(() => {
      vi.clearAllMocks()
      vi.restoreAllMocks()
    })

    /** @returns Mounted SetSupervisionUrl wrapper */
    function mountSetUrl () {
      return mount(SetSupervisionUrl, {
        global: {
          provide: createProvide(),
          stubs: {
            Button: ButtonStub,
          },
        },
        props: {
          chargingStationId: TEST_STATION_ID,
          hashId: TEST_HASH_ID,
        },
      })
    }

    it('should render the heading and station id', () => {
      const wrapper = mountSetUrl()
      expect(wrapper.find('h1').text()).toBe('Set Supervision Url')
      expect(wrapper.find('h2').text()).toBe(TEST_STATION_ID)
    })

    it('should render supervision url input', () => {
      const wrapper = mountSetUrl()
      expect(wrapper.find('input[name="supervision-url"]').exists()).toBe(true)
    })

    it('should render credential inputs', () => {
      const wrapper = mountSetUrl()
      expect(wrapper.find('input[name="supervision-user"]').exists()).toBe(true)
      expect(wrapper.find('input[name="supervision-password"]').exists()).toBe(true)
    })

    it('should toast error when url is empty on submit', async () => {
      const wrapper = mountSetUrl()
      const submitBtn = wrapper.findComponent(ButtonStub)
      await submitBtn.trigger('click')
      await flushPromises()
      expect(toastMock.error).toHaveBeenCalledWith('Supervision url is required')
      expect(mockClient.setSupervisionUrl).not.toHaveBeenCalled()
    })

    it('should call setSupervisionUrl with form values', async () => {
      const wrapper = mountSetUrl()
      const urlInput = wrapper.find('input[name="supervision-url"]')
      await urlInput.setValue('wss://new-server.com:9000')
      const userInput = wrapper.find('input[name="supervision-user"]')
      await userInput.setValue('admin')
      const passInput = wrapper.find('input[name="supervision-password"]')
      await passInput.setValue('secret')
      const submitBtn = wrapper.findComponent(ButtonStub)
      await submitBtn.trigger('click')
      await flushPromises()
      expect(mockClient.setSupervisionUrl).toHaveBeenCalledWith(
        TEST_HASH_ID,
        'wss://new-server.com:9000',
        'admin',
        'secret'
      )
    })

    it('should navigate to charging-stations after successful submit', async () => {
      const wrapper = mountSetUrl()
      const urlInput = wrapper.find('input[name="supervision-url"]')
      await urlInput.setValue('wss://host.com:8080')
      const submitBtn = wrapper.findComponent(ButtonStub)
      await submitBtn.trigger('click')
      await flushPromises()
      expect(mockPush).toHaveBeenCalledWith({ name: 'charging-stations' })
    })

    it('should not navigate when url is empty', async () => {
      const wrapper = mountSetUrl()
      const submitBtn = wrapper.findComponent(ButtonStub)
      await submitBtn.trigger('click')
      await flushPromises()
      expect(mockPush).not.toHaveBeenCalled()
    })
  })

  describe('StartTransaction', () => {
    beforeEach(() => {
      mockClient = createMockUIClient()
      mockPush.mockClear()
      mockRoute.value = {
        name: 'start-transaction',
        params: { chargingStationId: TEST_STATION_ID, connectorId: '1', hashId: TEST_HASH_ID },
        query: { evseId: '1', ocppVersion: '1.6' },
      }
    })

    afterEach(() => {
      vi.clearAllMocks()
      vi.restoreAllMocks()
    })

    /** @returns Mounted StartTransaction wrapper */
    function mountStartTx () {
      return mount(StartTransaction, {
        global: {
          provide: createProvide(),
          stubs: {
            Button: ButtonStub,
          },
        },
        props: {
          chargingStationId: TEST_STATION_ID,
          connectorId: '1',
          hashId: TEST_HASH_ID,
        },
      })
    }

    it('should render the heading and station info', () => {
      const wrapper = mountStartTx()
      expect(wrapper.find('h1').text()).toBe('Start Transaction')
      expect(wrapper.find('h2').text()).toBe(TEST_STATION_ID)
    })

    it('should render EVSE/Connector info when evseId is present', () => {
      const wrapper = mountStartTx()
      expect(wrapper.find('h3').text()).toContain('EVSE 1')
      expect(wrapper.find('h3').text()).toContain('Connector 1')
    })

    it('should render only connector info when evseId is absent', () => {
      mockRoute.value = {
        name: 'start-transaction',
        params: { chargingStationId: TEST_STATION_ID, connectorId: '2', hashId: TEST_HASH_ID },
        query: {},
      }
      const wrapper = mount(StartTransaction, {
        global: {
          provide: createProvide(),
          stubs: { Button: ButtonStub },
        },
        props: {
          chargingStationId: TEST_STATION_ID,
          connectorId: '2',
          hashId: TEST_HASH_ID,
        },
      })
      expect(wrapper.find('h3').text()).toBe('Connector 2')
    })

    it('should render RFID tag input', () => {
      const wrapper = mountStartTx()
      expect(wrapper.find('input[name="idtag"]').exists()).toBe(true)
    })

    it('should render authorize checkbox', () => {
      const wrapper = mountStartTx()
      const checkbox = wrapper.find('input[type="checkbox"]')
      expect(checkbox.exists()).toBe(true)
    })

    it('should toast error when authorizeIdTag is true and idTag is empty', async () => {
      const wrapper = mountStartTx()
      const submitBtn = wrapper.findComponent(ButtonStub)
      await submitBtn.trigger('click')
      await flushPromises()
      expect(toastMock.error).toHaveBeenCalledWith('Please provide an RFID tag to authorize')
      expect(mockClient.startTransaction).not.toHaveBeenCalled()
    })

    it('should call authorize then startTransaction on valid submit', async () => {
      const wrapper = mountStartTx()
      const idTagInput = wrapper.find('input[name="idtag"]')
      await idTagInput.setValue('RFID-001')
      const submitBtn = wrapper.findComponent(ButtonStub)
      await submitBtn.trigger('click')
      await flushPromises()
      expect(mockClient.authorize).toHaveBeenCalledWith(
        TEST_HASH_ID,
        'RFID-001',
        OCPPVersion.VERSION_16
      )
      expect(mockClient.startTransaction).toHaveBeenCalledWith(
        TEST_HASH_ID,
        expect.objectContaining({
          connectorId: 1,
          evseId: 1,
          idTag: 'RFID-001',
          ocppVersion: OCPPVersion.VERSION_16,
        })
      )
    })

    it('should toast success on successful transaction start', async () => {
      const wrapper = mountStartTx()
      const idTagInput = wrapper.find('input[name="idtag"]')
      await idTagInput.setValue('TAG-X')
      const submitBtn = wrapper.findComponent(ButtonStub)
      await submitBtn.trigger('click')
      await flushPromises()
      expect(toastMock.success).toHaveBeenCalledWith('Transaction successfully started')
    })

    it('should navigate to charging-stations after submit', async () => {
      const wrapper = mountStartTx()
      const idTagInput = wrapper.find('input[name="idtag"]')
      await idTagInput.setValue('TAG-Y')
      const submitBtn = wrapper.findComponent(ButtonStub)
      await submitBtn.trigger('click')
      await flushPromises()
      expect(mockPush).toHaveBeenCalledWith({ name: 'charging-stations' })
    })

    it('should skip authorize when checkbox is unchecked', async () => {
      const wrapper = mountStartTx()
      const checkbox = wrapper.find('input[type="checkbox"]')
      await checkbox.setValue(false)
      const idTagInput = wrapper.find('input[name="idtag"]')
      await idTagInput.setValue('TAG-Z')
      const submitBtn = wrapper.findComponent(ButtonStub)
      await submitBtn.trigger('click')
      await flushPromises()
      expect(mockClient.authorize).not.toHaveBeenCalled()
      expect(mockClient.startTransaction).toHaveBeenCalled()
    })

    it('should toast error when authorize fails', async () => {
      mockClient.authorize = vi.fn().mockRejectedValue(new Error('auth fail'))
      const wrapper = mountStartTx()
      const idTagInput = wrapper.find('input[name="idtag"]')
      await idTagInput.setValue('BAD-TAG')
      const submitBtn = wrapper.findComponent(ButtonStub)
      await submitBtn.trigger('click')
      await flushPromises()
      expect(toastMock.error).toHaveBeenCalledWith('Error at authorizing RFID tag')
      expect(mockClient.startTransaction).not.toHaveBeenCalled()
    })

    it('should toast error when startTransaction fails', async () => {
      mockClient.startTransaction = vi.fn().mockRejectedValue(new Error('tx fail'))
      const wrapper = mountStartTx()
      const checkbox = wrapper.find('input[type="checkbox"]')
      await checkbox.setValue(false)
      const idTagInput = wrapper.find('input[name="idtag"]')
      await idTagInput.setValue('TAG-ERR')
      const submitBtn = wrapper.findComponent(ButtonStub)
      await submitBtn.trigger('click')
      await flushPromises()
      expect(toastMock.error).toHaveBeenCalledWith('Error at starting transaction')
    })
  })

  describe('ShowDetails', () => {
    afterEach(() => {
      vi.clearAllMocks()
      vi.restoreAllMocks()
    })

    /**
     * Mounts ShowDetails with a provided store.
     * @param stations - Charging stations to seed the store with
     * @returns Mounted ShowDetails wrapper
     */
    function mountShowDetails (stations = [createChargingStationData()]) {
      return mount(ShowDetails, {
        global: {
          provide: {
            [chargingStationsKey as symbol]: shallowRef(stations),
          },
          stubs: { Button: ButtonStub },
        },
        props: {
          chargingStationId: TEST_STATION_ID,
          hashId: TEST_HASH_ID,
        },
      })
    }

    it('should render the heading and station id', () => {
      const wrapper = mountShowDetails()
      expect(wrapper.find('h1').text()).toBe('Show Details')
      expect(wrapper.find('h2').text()).toBe(TEST_STATION_ID)
    })

    it('should render the detail sections and OCPP parameters table', () => {
      const wrapper = mountShowDetails()
      const captions = wrapper.findAll('caption').map(c => c.text())
      expect(captions).toContain('General')
      expect(captions).toContain('Station Info')
      expect(captions).toContain('OCPP Parameters')
    })

    it('should render the empty message when no OCPP parameters are reported', () => {
      const wrapper = mountShowDetails([
        createChargingStationData({ ocppConfiguration: { configurationKey: [] } }),
      ])
      expect(wrapper.text()).toContain('No OCPP parameters reported')
    })

    it('should mask the supervision password in the rendered panel', () => {
      const wrapper = mountShowDetails([
        createChargingStationData({
          stationInfo: createStationInfo({ supervisionPassword: 'super-secret' }),
        }),
      ])
      expect(wrapper.text()).not.toContain('super-secret')
      expect(wrapper.text()).toContain(MASKED_VALUE_PLACEHOLDER)
    })

    it('should format OCPP readonly, reboot and missing value cells', () => {
      const wrapper = mountShowDetails([
        createChargingStationData({
          ocppConfiguration: {
            configurationKey: [{ key: 'RebootKey', readonly: true, reboot: true }],
          },
        }),
      ])
      const tables = wrapper.findAll('table.data-table')
      const ocppTable = tables[tables.length - 1]
      const row = ocppTable.findAll('tbody tr').find(tr => tr.find('th').text() === 'RebootKey')
      expect(row).toBeDefined()
      expect(row?.findAll('td').map(td => td.text())).toEqual([
        EMPTY_VALUE_PLACEHOLDER,
        'Yes',
        'Yes',
      ])
    })

    it('should render a not-found message when the station is absent from the store', () => {
      const wrapper = mountShowDetails([])
      expect(wrapper.text()).toContain('Charging station not found')
    })

    it('should navigate to charging-stations from the not-found panel', async () => {
      const wrapper = mountShowDetails([])
      await wrapper.findComponent(ButtonStub).trigger('click')
      await flushPromises()
      expect(mockPush).toHaveBeenCalledWith({ name: 'charging-stations' })
    })
  })

  describe('ChangeConfiguration', () => {
    beforeEach(() => {
      mockClient = createMockUIClient()
      mockPush.mockClear()
    })

    afterEach(() => {
      vi.clearAllMocks()
      vi.restoreAllMocks()
    })

    /**
     * Mounts ChangeConfiguration with a provided store.
     * @param stations - Charging stations to seed the store with
     * @returns Mounted ChangeConfiguration wrapper
     */
    function mountChange (stations = [createChargingStationData()]) {
      return mount(ChangeConfiguration, {
        global: {
          provide: {
            [chargingStationsKey as symbol]: shallowRef(stations),
            [uiClientKey as symbol]: mockClient,
          },
          stubs: { Button: ButtonStub },
        },
        props: {
          chargingStationId: TEST_STATION_ID,
          hashId: TEST_HASH_ID,
        },
      })
    }

    /**
     * Builds a station carrying the given OCPP configuration keys.
     * @param configurationKey - OCPP configuration keys to seed
     * @returns Charging station data with the keys
     */
    function stationWithKeys (configurationKey: ConfigurationKey[]) {
      return createChargingStationData({ ocppConfiguration: { configurationKey } })
    }

    it('should render the heading and station id', () => {
      const wrapper = mountChange()
      expect(wrapper.find('h1').text()).toBe('Change Configuration')
      expect(wrapper.find('h2').text()).toBe(TEST_STATION_ID)
    })

    it('should render a not-found panel and navigate away when the station is absent', async () => {
      const wrapper = mountChange([])
      expect(wrapper.text()).toContain('Charging station not found')
      await wrapper.findComponent(ButtonStub).trigger('click')
      await flushPromises()
      expect(mockPush).toHaveBeenCalledWith({ name: 'charging-stations' })
    })

    it('should render the empty message when no OCPP parameters are reported', () => {
      const wrapper = mountChange([stationWithKeys([])])
      expect(wrapper.text()).toContain('No OCPP parameters reported')
    })

    it('should exclude keys explicitly marked not visible', () => {
      const wrapper = mountChange([
        stationWithKeys([
          { key: 'HeartbeatInterval', readonly: false, value: '30' },
          { key: 'HiddenKey', readonly: false, value: 'x', visible: false },
        ]),
      ])
      expect(wrapper.find('input[name="configuration-value-HeartbeatInterval"]').exists()).toBe(
        true
      )
      expect(wrapper.find('input[name="configuration-value-HiddenKey"]').exists()).toBe(false)
    })

    it('should prefill inputs and disable read-only keys', () => {
      const wrapper = mountChange([
        stationWithKeys([
          { key: 'HeartbeatInterval', readonly: false, value: '30' },
          { key: 'SecretKey', readonly: true, value: 'x' },
        ]),
      ])
      const editable = wrapper.find<HTMLInputElement>(
        'input[name="configuration-value-HeartbeatInterval"]'
      )
      expect(editable.element.value).toBe('30')
      expect(editable.attributes('disabled')).toBeUndefined()
      expect(
        wrapper.find('input[name="configuration-value-SecretKey"]').attributes('disabled')
      ).toBeDefined()
    })

    it('should call changeConfiguration and toast success on save', async () => {
      const wrapper = mountChange([
        stationWithKeys([{ key: 'HeartbeatInterval', readonly: false, value: '30' }]),
      ])
      await wrapper.find('input[name="configuration-value-HeartbeatInterval"]').setValue('45')
      await wrapper.findAllComponents(ButtonStub)[0].trigger('click')
      await flushPromises()
      expect(mockClient.changeConfiguration).toHaveBeenCalledWith(
        TEST_HASH_ID,
        'HeartbeatInterval',
        '45'
      )
      expect(toastMock.success).toHaveBeenCalledWith(
        "Configuration key 'HeartbeatInterval' successfully set"
      )
    })

    it('should surface a reboot-required notice for reboot keys', async () => {
      const wrapper = mountChange([
        stationWithKeys([{ key: 'RebootKey', readonly: false, reboot: true, value: '1' }]),
      ])
      await wrapper.findAllComponents(ButtonStub)[0].trigger('click')
      await flushPromises()
      expect(toastMock.success).toHaveBeenCalledWith(
        "Configuration key 'RebootKey' set, reboot required to take effect"
      )
    })

    it('should not submit read-only keys', async () => {
      const wrapper = mountChange([
        stationWithKeys([{ key: 'SecretKey', readonly: true, value: 'x' }]),
      ])
      await wrapper.findAllComponents(ButtonStub)[0].trigger('click')
      await flushPromises()
      expect(mockClient.changeConfiguration).not.toHaveBeenCalled()
    })

    it('should toast an error when the backend rejects the change', async () => {
      mockClient.changeConfiguration = vi.fn().mockRejectedValue(new Error('boom'))
      const wrapper = mountChange([
        stationWithKeys([{ key: 'HeartbeatInterval', readonly: false, value: '30' }]),
      ])
      await wrapper.findAllComponents(ButtonStub)[0].trigger('click')
      await flushPromises()
      expect(toastMock.error).toHaveBeenCalledWith(
        "Error at setting configuration key 'HeartbeatInterval'"
      )
    })
  })
})
