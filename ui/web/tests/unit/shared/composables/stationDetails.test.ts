/**
 * @file Tests for the shared station details view-model builder
 * @description buildStationDetailSections field selection/formatting + password masking,
 *   and getVisibleConfigurationKeys visibility filtering.
 */
import { describe, expect, it } from 'vitest'

import { EMPTY_VALUE_PLACEHOLDER, MASKED_VALUE_PLACEHOLDER } from '@/core/index.js'
import {
  buildConfigurationRows,
  buildStationDetailSections,
  type DetailSection,
  getVisibleConfigurationKeys,
} from '@/shared/utils/index.js'

import { createChargingStationData, createStationInfo } from '../../constants.js'

/**
 * Reads a formatted entry value from built sections.
 * @param sections - Built detail sections
 * @param title - Section title
 * @param label - Entry label
 * @returns The entry value, or undefined if not present
 */
function readValue (sections: DetailSection[], title: string, label: string): string | undefined {
  return sections.find(section => section.title === title)?.entries.find(e => e.label === label)
    ?.value
}

describe('stationDetails', () => {
  describe('buildStationDetailSections', () => {
    it('should render core sections', () => {
      const sections = buildStationDetailSections(createChargingStationData())
      const titles = sections.map(section => section.title)
      expect(titles).toContain('General')
      expect(titles).toContain('Station Info')
      expect(titles).toContain('Credentials')
    })

    it('should format booleans as Yes/No', () => {
      const started = readValue(
        buildStationDetailSections(createChargingStationData({ started: true })),
        'General',
        'Started'
      )
      const stopped = readValue(
        buildStationDetailSections(createChargingStationData({ started: false })),
        'General',
        'Started'
      )
      expect(started).toBe('Yes')
      expect(stopped).toBe('No')
    })

    it('should render the empty placeholder for missing scalar fields', () => {
      const sections = buildStationDetailSections(
        createChargingStationData({
          stationInfo: createStationInfo({ firmwareVersion: undefined }),
        })
      )
      expect(readValue(sections, 'Station Info', 'Firmware Version')).toBe(EMPTY_VALUE_PLACEHOLDER)
    })

    it('should mask the supervision password and never expose the raw value', () => {
      const sections = buildStationDetailSections(
        createChargingStationData({
          stationInfo: createStationInfo({ supervisionPassword: 'super-secret' }),
        })
      )
      const value = readValue(sections, 'Credentials', 'Supervision Password')
      expect(value).toBe(MASKED_VALUE_PLACEHOLDER)
      expect(value).not.toContain('super-secret')
    })

    it('should render the empty placeholder for an unset supervision password', () => {
      const sections = buildStationDetailSections(
        createChargingStationData({
          stationInfo: createStationInfo({ supervisionPassword: undefined }),
        })
      )
      expect(readValue(sections, 'Credentials', 'Supervision Password')).toBe(
        EMPTY_VALUE_PLACEHOLDER
      )
    })

    it('should include the Boot Notification section only when present', () => {
      const withBoot = buildStationDetailSections(createChargingStationData())
      expect(withBoot.map(section => section.title)).toContain('Boot Notification')
      const withoutBoot = buildStationDetailSections(
        createChargingStationData({ bootNotificationResponse: undefined })
      )
      expect(withoutBoot.map(section => section.title)).not.toContain('Boot Notification')
    })

    it('should include the ATG section only when an ATG configuration is present', () => {
      const withoutATG = buildStationDetailSections(createChargingStationData())
      expect(withoutATG.map(section => section.title)).not.toContain(
        'Automatic Transaction Generator'
      )
      const withATG = buildStationDetailSections(
        createChargingStationData({
          automaticTransactionGenerator: {
            automaticTransactionGenerator: {
              enable: true,
              maxDelayBetweenTwoTransactions: 0,
              maxDuration: 0,
              minDelayBetweenTwoTransactions: 0,
              minDuration: 0,
              probabilityOfStart: 1,
              stopAbsoluteDuration: false,
              stopAfterHours: 0,
            },
          },
        })
      )
      const atg = withATG.find(section => section.title === 'Automatic Transaction Generator')
      expect(atg?.entries.find(e => e.label === 'Enabled')?.value).toBe('Yes')
    })
  })

  describe('getVisibleConfigurationKeys', () => {
    it('should exclude keys explicitly marked not visible', () => {
      const keys = getVisibleConfigurationKeys(
        createChargingStationData({
          ocppConfiguration: {
            configurationKey: [
              { key: 'Visible', readonly: false, value: 'a' },
              { key: 'Shown', readonly: true, value: 'b', visible: true },
              { key: 'Hidden', readonly: false, value: 'c', visible: false },
            ],
          },
        })
      )
      expect(keys.map(key => key.key)).toEqual(['Visible', 'Shown'])
    })

    it('should return an empty array when no configuration keys are reported', () => {
      expect(
        getVisibleConfigurationKeys(createChargingStationData({ ocppConfiguration: {} }))
      ).toEqual([])
    })
  })

  describe('buildConfigurationRows', () => {
    it('should format readonly, reboot and missing value for display', () => {
      const rows = buildConfigurationRows(
        createChargingStationData({
          ocppConfiguration: {
            configurationKey: [{ key: 'HeartbeatInterval', readonly: true, reboot: true }],
          },
        })
      )
      expect(rows).toEqual([
        {
          key: 'HeartbeatInterval',
          readonly: 'Yes',
          reboot: 'Yes',
          value: EMPTY_VALUE_PLACEHOLDER,
        },
      ])
    })

    it('should format non-readonly, non-reboot keys with their value', () => {
      const rows = buildConfigurationRows(
        createChargingStationData({
          ocppConfiguration: {
            configurationKey: [{ key: 'MeterValueSampleInterval', readonly: false, value: '60' }],
          },
        })
      )
      expect(rows).toEqual([
        { key: 'MeterValueSampleInterval', readonly: 'No', reboot: 'No', value: '60' },
      ])
    })

    it('should exclude keys marked not visible', () => {
      const rows = buildConfigurationRows(
        createChargingStationData({
          ocppConfiguration: {
            configurationKey: [
              { key: 'Shown', readonly: false, value: 'a' },
              { key: 'Hidden', readonly: false, value: 'b', visible: false },
            ],
          },
        })
      )
      expect(rows.map(row => row.key)).toEqual(['Shown'])
    })
  })
})
