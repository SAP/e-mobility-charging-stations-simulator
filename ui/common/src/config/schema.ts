import { z } from 'zod'

import { AuthenticationType } from '../types/UIProtocol.js'

export const authenticationConfigSchema = z
  .object({
    enabled: z.boolean(),
    password: z.string().optional(),
    type: z.enum(AuthenticationType),
    username: z.string().optional(),
  })
  .refine(
    data =>
      !data.enabled ||
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      data.type !== AuthenticationType.PROTOCOL_BASIC_AUTH ||
      (data.username != null && data.username.length > 0 && data.password != null),
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
  protocol: z.string().min(1).default('ui'),
  secure: z.boolean().optional().default(false),
  version: z.string().min(1).default('0.0.1'),
})

export const configurationSchema = z.object({
  uiServer: z.union([uiServerConfigSchema, z.array(uiServerConfigSchema)]),
})

export type Configuration = z.infer<typeof configurationSchema>
export type UIServerConfig = z.infer<typeof uiServerConfigSchema>
