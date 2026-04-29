/**
 * @file Tests for modern dialogs (Add / SetSupervisionUrl / StartTransaction / Authorize)
 * @description Form interaction, payload shaping, error display.
 *   Modal is mocked to skip the Teleport so wrapper.find() reaches dialog inputs.
 */
import { flushPromises, mount } from '@vue/test-utils'
import { ResponseStatus, ServerFailureError } from 'ui-common'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, ref } from 'vue'

import { chargingStationsKey, templatesKey, uiClientKey } from '@/composables'

// Mock Modal to render slots inline (no Teleport), so `wrapper.find()` works.
vi.mock('@/skins/modern/components/Modal.vue', () => ({
  default: defineComponent({
    emits: ['close'],
    name: 'V2ModalStub',
    props: {
      closeOnBackdrop: { default: true, type: Boolean },
      title: { required: true, type: String },
    },
    template:
      '<div class="stub-modal"><h2>{{ title }}</h2><div class="stub-modal__body"><slot /></div><div class="stub-modal__foot"><slot name="footer" /></div></div>',
  }),
}))

import AddStationsDialog from '@/skins/modern/components/dialogs/AddStationsDialog.vue'
import AuthorizeDialog from '@/skins/modern/components/dialogs/AuthorizeDialog.vue'
import SetSupervisionUrlDialog from '@/skins/modern/components/dialogs/SetSupervisionUrlDialog.vue'
import StartTransactionDialog from '@/skins/modern/components/dialogs/StartTransactionDialog.vue'

import { toastMock } from '../../../setup'
import { createChargingStationData, TEST_HASH_ID, TEST_STATION_ID } from '../../constants'
import { createMockUIClient, type MockUIClient } from '../../helpers'

let mockClient: MockUIClient

describe('Modern skin dialogs', () => {
  beforeEach(() => {
    mockClient = createMockUIClient()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('AddStationsDialog', () => {
    /**
     * @param templates - Template names to provide to the dialog
     * @returns Mounted wrapper for AddStationsDialog
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

    it('should render template options', () => {
      const wrapper = mountDialog()
      expect(wrapper.text()).toContain('template-A.json')
      expect(wrapper.text()).toContain('template-B.json')
    })

    it('should submit payload on success and emit close', async () => {
      const wrapper = mountDialog()
      await wrapper.find('#modern-add-template').setValue('template-A.json')
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
      expect(wrapper.emitted('close')).toBeTruthy()
    })

    it('should send fixedName=true when baseName set and checkbox checked', async () => {
      const wrapper = mountDialog()
      await wrapper.find('#modern-add-template').setValue('template-A.json')
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

    it('should pass supervision url and credentials when filled', async () => {
      const wrapper = mountDialog()
      await wrapper.find('#modern-add-template').setValue('template-A.json')
      await wrapper.find('input[type="url"]').setValue('wss://example.com/ocpp')
      const textInputs = wrapper.findAll('input[type="text"]')
      await textInputs[1].setValue('alice')
      await wrapper.find('input[type="password"]').setValue('secret')
      await wrapper.findAll('.stub-modal__foot button')[1].trigger('click')
      await flushPromises()
      expect(mockClient.addChargingStations).toHaveBeenCalledWith(
        'template-A.json',
        1,
        expect.objectContaining({
          supervisionPassword: 'secret',
          supervisionUrls: 'wss://example.com/ocpp',
          supervisionUser: 'alice',
        })
      )
    })

    it('should cancel and emit close', async () => {
      const wrapper = mountDialog()
      await wrapper.findAll('.stub-modal__foot button')[0].trigger('click')
      await flushPromises()
      expect(wrapper.emitted('close')).toBeTruthy()
    })
  })

  describe('SetSupervisionUrlDialog', () => {
    /**
     * @param stations - Charging station data to provide to the dialog
     * @returns Mounted wrapper for SetSupervisionUrlDialog
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

    it('should prefill URL stripped of trailing /chargingStationId', () => {
      const wrapper = mountDialog([
        createChargingStationData({
          supervisionUrl: `wss://host:9000/${TEST_STATION_ID}`,
        }),
      ])
      const input = wrapper.find<HTMLInputElement>('#modern-sup-url').element
      expect(input.value).toBe('wss://host:9000')
    })

    it('should prefill username and password from stationInfo', () => {
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
      const user = wrapper.find<HTMLInputElement>('#modern-sup-user').element
      const pass = wrapper.find<HTMLInputElement>('#modern-sup-pass').element
      expect(user.value).toBe('u')
      expect(pass.value).toBe('pw')
    })

    it('should fall back to empty strings when station not found', () => {
      const wrapper = mountDialog([])
      const input = wrapper.find<HTMLInputElement>('#modern-sup-url').element
      expect(input.value).toBe('')
    })

    it('should reject submission when URL is empty', async () => {
      const wrapper = mountDialog([])
      await wrapper.findAll('.stub-modal__foot button')[1].trigger('click')
      await flushPromises()
      expect(toastMock.error).toHaveBeenCalled()
      expect(mockClient.setSupervisionUrl).not.toHaveBeenCalled()
    })

    it('should send credentials and reconnects when station is started', async () => {
      const wrapper = mountDialog([
        createChargingStationData({
          started: true,
          supervisionUrl: `wss://host/${TEST_STATION_ID}`,
        }),
      ])
      await wrapper.find('#modern-sup-url').setValue('wss://new.example.com')
      await wrapper.find('#modern-sup-user').setValue('alice')
      await wrapper.find('#modern-sup-pass').setValue('pw')
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
      expect(wrapper.emitted('close')).toBeTruthy()
    })

    it('should not reconnect when station is stopped', async () => {
      const wrapper = mountDialog([
        createChargingStationData({
          started: false,
          supervisionUrl: `wss://host/${TEST_STATION_ID}`,
        }),
      ])
      await wrapper.find('#modern-sup-url').setValue('wss://new.example.com')
      await wrapper.findAll('.stub-modal__foot button')[1].trigger('click')
      await flushPromises()
      expect(mockClient.setSupervisionUrl).toHaveBeenCalled()
      expect(mockClient.closeConnection).not.toHaveBeenCalled()
      expect(mockClient.openConnection).not.toHaveBeenCalled()
    })

    it('should skip reconnect when checkbox is unchecked', async () => {
      const wrapper = mountDialog([
        createChargingStationData({
          started: true,
          supervisionUrl: `wss://host/${TEST_STATION_ID}`,
        }),
      ])
      await wrapper.find('#modern-sup-url').setValue('wss://new.example.com')
      const reconnectBox = wrapper.find<HTMLInputElement>('input[type="checkbox"]')
      await reconnectBox.setValue(false)
      await wrapper.findAll('.stub-modal__foot button')[1].trigger('click')
      await flushPromises()
      expect(mockClient.closeConnection).not.toHaveBeenCalled()
      expect(mockClient.openConnection).not.toHaveBeenCalled()
    })

    it('should emit close when cancel button is clicked', async () => {
      const wrapper = mountDialog([])
      await wrapper.findAll('.stub-modal__foot button')[0].trigger('click')
      await flushPromises()
      expect(wrapper.emitted('close')).toBeTruthy()
    })
  })

  describe('StartTransactionDialog', () => {
    /**
     * @param extraProps - Additional props to merge into the dialog's props
     * @returns Mounted wrapper for StartTransactionDialog
     */
    function mountDialog (extraProps: Record<string, unknown> = {}) {
      return mount(StartTransactionDialog, {
        global: { provide: { [uiClientKey as symbol]: mockClient } },
        props: {
          chargingStationId: TEST_STATION_ID,
          connectorId: '1',
          hashId: TEST_HASH_ID,
          ...extraProps,
        },
      })
    }

    it('should reject authorize-first when no idTag provided', async () => {
      const wrapper = mountDialog()
      const checkbox = wrapper.find<HTMLInputElement>('input[type="checkbox"]')
      await checkbox.setValue(true)
      await wrapper.findAll('.stub-modal__foot button')[1].trigger('click')
      await flushPromises()
      expect(toastMock.error).toHaveBeenCalled()
      expect(mockClient.authorize).not.toHaveBeenCalled()
      expect(mockClient.startTransaction).not.toHaveBeenCalled()
    })

    it('should authorize then starts transaction when authorize-first checked', async () => {
      const wrapper = mountDialog()
      await wrapper.find('#modern-tx-idtag').setValue('RFID-01')
      const checkbox = wrapper.find<HTMLInputElement>('input[type="checkbox"]')
      await checkbox.setValue(true)
      await wrapper.findAll('.stub-modal__foot button')[1].trigger('click')
      await flushPromises()
      expect(mockClient.authorize).toHaveBeenCalledWith(TEST_HASH_ID, 'RFID-01')
      expect(mockClient.startTransaction).toHaveBeenCalledWith(
        TEST_HASH_ID,
        expect.objectContaining({ connectorId: 1, idTag: 'RFID-01' })
      )
      expect(wrapper.emitted('close')).toBeTruthy()
    })

    it('should skip authorize when checkbox is unchecked', async () => {
      const wrapper = mountDialog()
      const checkbox = wrapper.find<HTMLInputElement>('input[type="checkbox"]')
      await checkbox.setValue(false)
      await wrapper.find('#modern-tx-idtag').setValue('RFID-01')
      await wrapper.findAll('.stub-modal__foot button')[1].trigger('click')
      await flushPromises()
      expect(mockClient.authorize).not.toHaveBeenCalled()
      expect(mockClient.startTransaction).toHaveBeenCalled()
    })

    it('should include evseId and ocppVersion from props', async () => {
      const wrapper = mountDialog({ evseId: 2, ocppVersion: '1.6' })
      await wrapper.find('#modern-tx-idtag').setValue('RFID-01')
      await wrapper.findAll('.stub-modal__foot button')[1].trigger('click')
      await flushPromises()
      expect(mockClient.startTransaction).toHaveBeenCalledWith(
        TEST_HASH_ID,
        expect.objectContaining({ evseId: 2, ocppVersion: '1.6' })
      )
      expect(wrapper.text()).toContain('EVSE 2')
    })

    it('should show Connector-only target label when no evseId', () => {
      const wrapper = mountDialog()
      expect(wrapper.text()).toContain('Connector 1')
      expect(wrapper.text()).not.toContain('EVSE')
    })

    it('should toast error when authorize fails', async () => {
      const wrapper = mountDialog()
      mockClient.authorize = vi.fn().mockRejectedValue(new Error('auth failed'))
      await wrapper.find('#modern-tx-idtag').setValue('BAD-TAG')
      const checkbox = wrapper.find<HTMLInputElement>('input[type="checkbox"]')
      await checkbox.setValue(true)
      await wrapper.findAll('.stub-modal__foot button')[1].trigger('click')
      await flushPromises()
      expect(toastMock.error).toHaveBeenCalled()
      expect(mockClient.startTransaction).not.toHaveBeenCalled()
    })

    it('should toast error when startTransaction fails', async () => {
      const wrapper = mountDialog()
      mockClient.startTransaction = vi.fn().mockRejectedValue(new Error('tx failed'))
      await wrapper.find('#modern-tx-idtag').setValue('RFID')
      await wrapper.findAll('.stub-modal__foot button')[1].trigger('click')
      await flushPromises()
      expect(toastMock.error).toHaveBeenCalled()
    })

    it('should display error details when startTransaction rejects', async () => {
      const wrapper = mountDialog()
      mockClient.startTransaction = vi.fn().mockRejectedValue(
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
      await wrapper.find('#modern-tx-idtag').setValue('BAD-TAG')
      await wrapper.findAll('.stub-modal__foot button')[1].trigger('click')
      await flushPromises()
      expect(wrapper.find('.modern-form__error').exists()).toBe(true)
      expect(wrapper.text()).toContain('Invalid')
      expect(wrapper.find('.modern-form__error-details').exists()).toBe(true)
      expect(wrapper.emitted('close')).toBeFalsy()
    })

    it('should emit close when cancel button is clicked', async () => {
      const wrapper = mountDialog()
      await wrapper.findAll('.stub-modal__foot button')[0].trigger('click')
      await flushPromises()
      expect(wrapper.emitted('close')).toBeTruthy()
    })
  })

  describe('AuthorizeDialog', () => {
    /**
     * @returns Mounted wrapper for AuthorizeDialog
     */
    function mountDialog () {
      return mount(AuthorizeDialog, {
        global: { provide: { [uiClientKey as symbol]: mockClient } },
        props: { chargingStationId: TEST_STATION_ID, hashId: TEST_HASH_ID },
      })
    }

    it('should reject when idTag is empty', async () => {
      const wrapper = mountDialog()
      await wrapper.findAll('.stub-modal__foot button')[1].trigger('click')
      await flushPromises()
      expect(toastMock.error).toHaveBeenCalled()
      expect(mockClient.authorize).not.toHaveBeenCalled()
    })

    it('should call authorize and emits close on success', async () => {
      const wrapper = mountDialog()
      await wrapper.find('#modern-auth-tag').setValue('GOOD')
      await wrapper.findAll('.stub-modal__foot button')[1].trigger('click')
      await flushPromises()
      expect(mockClient.authorize).toHaveBeenCalledWith(TEST_HASH_ID, 'GOOD')
      expect(toastMock.success).toHaveBeenCalled()
      expect(wrapper.emitted('close')).toBeTruthy()
    })

    it('should surface ServerFailureError status and payload JSON panel', async () => {
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
      await wrapper.find('#modern-auth-tag').setValue('BAD')
      await wrapper.findAll('.stub-modal__foot button')[1].trigger('click')
      await flushPromises()
      expect(toastMock.error).toHaveBeenCalledWith(
        expect.stringContaining('Authorize failed: Blocked')
      )
      expect(wrapper.text()).toContain('Blocked')
      expect(wrapper.find('.modern-form__error-details').exists()).toBe(true)
    })

    it('should emit close when cancel is clicked', async () => {
      const wrapper = mountDialog()
      await wrapper.findAll('.stub-modal__foot button')[0].trigger('click')
      await flushPromises()
      expect(wrapper.emitted('close')).toBeTruthy()
    })
  })
})
