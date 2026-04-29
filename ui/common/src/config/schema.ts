import { z } from 'zod'

import { AuthenticationType, Protocol, ProtocolVersion } from '../types/UIProtocol.js'

export const SKIN_IDS = ['classic', 'modern'] as const
export const THEME_IDS = ['catppuccin-latte', 'sap-horizon', 'tokyo-night-storm'] as const

export const authenticationConfigSchema = z
  .object({
    enabled: z.boolean(),
    password: z.string().optional(),
    type: z.enum(AuthenticationType),
    username: z
      .string()
      .regex(/^[^:]*$/, 'must not contain ":"')
      .optional(),
  })
  .refine(
    data =>
      !data.enabled ||
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      data.type !== AuthenticationType.PROTOCOL_BASIC_AUTH ||
      (data.username != null &&
        data.username.length > 0 &&
        data.password != null &&
        data.password.length > 0),
    {
      message:
        'username and password are required when authentication is enabled with protocol-basic-auth',
    }
  )

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
