import { type ClassValue, clsx } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

import tailwindConfig from '../tailwind.config'

const twMergeCustom = extendTailwindMerge({
  extend: {
    classGroups: {
      h: Object.keys(tailwindConfig.theme.extend.height).map(
        (key) => `h-${key}`
      ),
      'min-h': Object.keys(tailwindConfig.theme.extend.minHeight).map(
        (key) => `min-h-${key}`
      ),
    },
    theme: {
      font: ['heading', 'body', 'code'],
      'font-weight': ['default', 'bold', 'bolder', 'boldest'],
      leading: [
        'none',
        'smallest',
        'smaller',
        'small',
        'default',
        'large',
        'larger',
        'largest',
      ],
      radius: ['full', 'default', 'narrow'],
      shadow: ['overlay'],
      spacing: [
        'default',
        'narrower',
        'narrow',
        'wide',
        'wider',
        'widest',
      ],
      text: [
        'smallest',
        'small',
        'default',
        'large',
        'larger',
        'largest',
        'giant',
        'enormous',
      ],
      tracking: ['default', 'tight', 'tighter', 'tightest'],
    },
  },
})

/**
 *
 * @param inputs
 */
export function cn (...inputs: ClassValue[]) {
  return twMergeCustom(clsx(inputs))
}
