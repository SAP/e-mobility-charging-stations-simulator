import { z } from 'zod'

import { AuthenticationType, Protocol, ProtocolVersion } from '../types/UIProtocol.js'

export const SKIN_IDS = ['classic', 'modern'] as const
export const THEME_IDS = [
  'catppuccin-latte',
  'dracula',
  'gruvbox-dark',
  'rose-pine',
  'sap-horizon',
  'teal-dark',
  'teal-light',
  'tokyo-night-storm',
] as const

/**
 * authenticationConfig — Web UI client credentials. `username` is a non-empty
 * string without `':'` (RFC 7617); `password` is a non-empty string. Both are
 * required when `enabled` is true and `type === 'protocol-basic-auth'`.
 * Field-level constraints fire unconditionally — intentionally stricter than
 * the runtime auth flow so empty placeholders cannot ship under
 * `enabled: false` and become a Basic-Auth bypass on the next boot with
 * `enabled: true`.
 */
export const authenticationConfigSchema = z
  .object({
    enabled: z.boolean(),
    password: z.string().min(1).optional(),
    type: z.enum(AuthenticationType),
    username: z
      .string()
      .min(1)
      .refine(value => !value.includes(':'), {
        message: "must not contain ':' (RFC 7617)",
      })
      .optional(),
  })
  .superRefine((value, ctx) => {
    if (!value.enabled) return
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (value.type !== AuthenticationType.PROTOCOL_BASIC_AUTH) return
    if (value.username == null) {
      ctx.addIssue({
        code: 'custom',
        message: "'username' is required when authentication is enabled with protocol-basic-auth",
        path: ['username'],
      })
    }
    if (value.password == null) {
      ctx.addIssue({
        code: 'custom',
        message: "'password' is required when authentication is enabled with protocol-basic-auth",
        path: ['password'],
      })
    }
  })

export const uiServerConfigSchema = z.object({
  authentication: authenticationConfigSchema.optional(),
  host: z.string().min(1),
  name: z.string().optional(),
  port: z.number().int().min(1).max(65535),
  protocol: z.enum(Protocol),
  secure: z.boolean().optional(),
  version: z.enum(ProtocolVersion),
})

export const configurationSchema = z.object({
  skin: z.enum(SKIN_IDS).optional(),
  theme: z.enum(THEME_IDS).optional(),
  uiServer: z.union([uiServerConfigSchema, z.array(uiServerConfigSchema)]),
})

export type Configuration = z.infer<typeof configurationSchema>
export type UIServerConfigurationSection = z.infer<typeof uiServerConfigSchema>
