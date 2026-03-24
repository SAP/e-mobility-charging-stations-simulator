import { type McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js'
import { readdir, readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { AbstractUIServer } from '../AbstractUIServer.js'

import { OCPPVersion } from '../../../types/index.js'

export const registerMCPResources = (server: McpServer, uiServer: AbstractUIServer): void => {
  server.registerResource(
    'station-list',
    'station://list',
    {
      description: 'List all charging stations with their current status and info',
      mimeType: 'application/json',
    },
    _uri => ({
      contents: [
        {
          mimeType: 'application/json',
          text: JSON.stringify(uiServer.listChargingStationData(), null, 2),
          uri: 'station://list',
        },
      ],
    })
  )

  server.registerResource(
    'station-by-id',
    new ResourceTemplate('station://{hashId}', { list: undefined }),
    {
      description: 'Get data for a specific charging station by its hash ID',
      mimeType: 'application/json',
    },
    (uri, { hashId }) => {
      const data = uiServer.getChargingStationData(hashId as string)
      return {
        contents: [
          {
            mimeType: 'application/json',
            text:
              data != null
                ? JSON.stringify(data, null, 2)
                : JSON.stringify({ error: `Station '${hashId as string}' not found` }),
            uri: uri.href,
          },
        ],
      }
    }
  )

  server.registerResource(
    'template-list',
    'template://list',
    {
      description: 'List all available charging station configuration templates',
      mimeType: 'application/json',
    },
    _uri => ({
      contents: [
        {
          mimeType: 'application/json',
          text: JSON.stringify(uiServer.getChargingStationTemplates(), null, 2),
          uri: 'template://list',
        },
      ],
    })
  )
}

const OCPP_SCHEMA_VERSIONS = [OCPPVersion.VERSION_16, OCPPVersion.VERSION_20] as const

const getSchemaBaseDir = (): string => {
  const currentDir = dirname(fileURLToPath(import.meta.url))
  return join(currentDir, 'assets', 'json-schemas', 'ocpp')
}

// Path traversal guard: validate that the resolved path stays within the expected base directory.
const isPathWithinBase = (candidatePath: string, baseDir: string): boolean => {
  const resolvedBase = resolve(baseDir)
  const resolvedCandidate = resolve(candidatePath)
  return resolvedCandidate.startsWith(`${resolvedBase}/`) || resolvedCandidate === resolvedBase
}

export const registerMCPSchemaResources = (server: McpServer): void => {
  for (const version of OCPP_SCHEMA_VERSIONS) {
    server.registerResource(
      `ocpp-${version}-schema-list`,
      `schema://ocpp/${version}`,
      {
        description: `List all available OCPP ${version} JSON command schemas`,
        mimeType: 'application/json',
      },
      async _uri => {
        try {
          const baseDir = getSchemaBaseDir()
          const schemaDir = join(baseDir, version)
          if (!isPathWithinBase(schemaDir, baseDir)) {
            return {
              contents: [
                {
                  mimeType: 'application/json',
                  text: JSON.stringify({ error: `Invalid OCPP version '${version}'` }),
                  uri: `schema://ocpp/${version}`,
                },
              ],
            }
          }
          const files = await readdir(schemaDir)
          const commands = files
            .filter(f => f.endsWith('.json'))
            .map(f => f.replace('.json', ''))
            .sort((a, b) => a.localeCompare(b))
          return {
            contents: [
              {
                mimeType: 'application/json',
                text: JSON.stringify({ commands, count: commands.length, version }, null, 2),
                uri: `schema://ocpp/${version}`,
              },
            ],
          }
        } catch {
          return {
            contents: [
              {
                mimeType: 'application/json',
                text: JSON.stringify({ error: `OCPP ${version} schemas not available` }),
                uri: `schema://ocpp/${version}`,
              },
            ],
          }
        }
      }
    )
  }

  server.registerResource(
    'ocpp-schema-by-command',
    new ResourceTemplate('schema://ocpp/{version}/{command}', { list: undefined }),
    {
      description:
        'Full OCPP JSON schema for a specific command (e.g., schema://ocpp/1.6/Authorize or schema://ocpp/2.0/AuthorizeRequest)',
      mimeType: 'application/json',
    },
    async (uri, { command, version }) => {
      try {
        const versionStr = version as string
        const commandStr = command as string
        const baseDir = getSchemaBaseDir()
        const schemaPath = join(baseDir, versionStr, `${commandStr}.json`)
        if (!isPathWithinBase(schemaPath, baseDir)) {
          return {
            contents: [
              {
                mimeType: 'application/json',
                text: JSON.stringify({
                  error: `Invalid schema path for '${commandStr}' in OCPP ${versionStr}`,
                }),
                uri: uri.href,
              },
            ],
          }
        }
        const content = await readFile(schemaPath, 'utf8')
        return {
          contents: [
            {
              mimeType: 'application/json',
              text: content,
              uri: uri.href,
            },
          ],
        }
      } catch {
        return {
          contents: [
            {
              mimeType: 'application/json',
              text: JSON.stringify({
                error: `Schema '${command as string}' not found for OCPP ${version as string}`,
              }),
              uri: uri.href,
            },
          ],
        }
      }
    }
  )
}
