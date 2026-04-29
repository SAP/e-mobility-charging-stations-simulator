/**
 * @file Tests for SkinLoadError and SkinLoading shared components
 * @description Verifies that the skin loading/error boundary components render correctly
 */
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import SkinLoadError from '@/shared/components/SkinLoadError.vue'
import SkinLoading from '@/shared/components/SkinLoading.vue'

describe('SkinLoadError and SkinLoading', () => {
  describe('SkinLoadError', () => {
    it('should render an error message', () => {
      const wrapper = mount(SkinLoadError)
      expect(wrapper.text()).toContain('Failed to load skin layout.')
    })

    it('should emit retry event when the retry button is clicked', async () => {
      const wrapper = mount(SkinLoadError)
      await wrapper.find('button').trigger('click')
      expect(wrapper.emitted('retry')).toHaveLength(1)
    })
  })

  describe('SkinLoading', () => {
    it('should render a spinner element', () => {
      const wrapper = mount(SkinLoading)
      expect(wrapper.find('.skin-loading__spinner').exists()).toBe(true)
    })

    it('should render loading text', () => {
      const wrapper = mount(SkinLoading)
      expect(wrapper.text()).toContain('Loading')
    })
  })
})
