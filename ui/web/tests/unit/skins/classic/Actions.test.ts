/**
 * @file Actions.test.ts
 * @description Unit tests for classic skin action components: AddChargingStations, SetSupervisionUrl, StartTransaction.
 */
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref, shallowRef } from 'vue'

import { chargingStationsKey, configurationKey, templatesKey, uiClientKey } from '@/composables'
import AddChargingStations from '@/skins/classic/components/actions/AddChargingStations.vue'
import SetSupervisionUrl from '@/skins/classic/components/actions/SetSupervisionUrl.vue'
import StartTransaction from '@/skins/classic/components/actions/StartTransaction.vue'

import { toastMock } from '../../../setup.js'
import { createUIServerConfig, TEST_HASH_ID, TEST_STATION_ID } from '../../constants.js'
import { ButtonStub, createMockUIClient, type MockUIClient } from '../../helpers.js'

const mockPush = vi.fn()
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

describe('classic action components', () => {
  describe('AddChargingStations', () => {
    beforeEach(() => {
      mockClient = createMockUIClient()
      mockPush.mockClear()
    })

    afterEach(() => {
      vi.clearAllMocks()
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
      expect(mockClient.authorize).toHaveBeenCalledWith(TEST_HASH_ID, 'RFID-001')
      expect(mockClient.startTransaction).toHaveBeenCalledWith(
        TEST_HASH_ID,
        expect.objectContaining({
          connectorId: 1,
          evseId: 1,
          idTag: 'RFID-001',
          ocppVersion: '1.6',
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
})
