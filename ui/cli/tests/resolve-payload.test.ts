import assert from 'node:assert'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'

import { resolvePayload } from '../src/commands/resolve-payload.js'

await describe('resolvePayload', async () => {
  await describe('inline JSON', async () => {
    await it('parses valid JSON object', async () => {
      const result = await resolvePayload('{"key":"value"}')
      assert.deepStrictEqual(result, { key: 'value' })
    })

    await it('trims whitespace', async () => {
      const result = await resolvePayload('  {"key":"value"}  ')
      assert.deepStrictEqual(result, { key: 'value' })
    })

    await it('rejects invalid JSON', async () => {
      await assert.rejects(
        () => resolvePayload('not json'),
        (error: Error) => {
          assert.ok(error.message.includes('Invalid JSON payload'))
          return true
        }
      )
    })

    await it('rejects JSON array', async () => {
      await assert.rejects(
        () => resolvePayload('[1,2,3]'),
        (error: Error) => {
          assert.ok(error.message.includes('must be a JSON object'))
          return true
        }
      )
    })

    await it('rejects JSON string', async () => {
      await assert.rejects(
        () => resolvePayload('"hello"'),
        (error: Error) => {
          assert.ok(error.message.includes('must be a JSON object'))
          return true
        }
      )
    })

    await it('rejects empty string', async () => {
      await assert.rejects(
        () => resolvePayload(''),
        (error: Error) => {
          assert.ok(error.message.includes('Empty payload'))
          return true
        }
      )
    })

    await it('rejects whitespace-only string', async () => {
      await assert.rejects(
        () => resolvePayload('   '),
        (error: Error) => {
          assert.ok(error.message.includes('Empty payload'))
          return true
        }
      )
    })
  })

  await describe('@file', async () => {
    let tmpDir: string

    await it('reads JSON from file', async () => {
      tmpDir = mkdtempSync(join(tmpdir(), 'evse-cli-test-'))
      const filePath = join(tmpDir, 'test.json')
      writeFileSync(filePath, '{"fromFile":true}', 'utf8')

      const result = await resolvePayload(`@${filePath}`)
      assert.deepStrictEqual(result, { fromFile: true })

      rmSync(tmpDir, { recursive: true })
    })

    await it('rejects missing file', async () => {
      await assert.rejects(
        () => resolvePayload('@/nonexistent/path.json'),
        (error: Error) => {
          assert.ok(error.message.includes('ENOENT'))
          return true
        }
      )
    })

    await it('rejects empty path after @', async () => {
      await assert.rejects(
        () => resolvePayload('@'),
        (error: Error) => {
          assert.ok(error.message.includes('Missing file path after @'))
          return true
        }
      )
    })

    await it('rejects file with invalid JSON', async () => {
      tmpDir = mkdtempSync(join(tmpdir(), 'evse-cli-test-'))
      const filePath = join(tmpDir, 'bad.json')
      writeFileSync(filePath, 'not json', 'utf8')

      await assert.rejects(
        () => resolvePayload(`@${filePath}`),
        (error: Error) => {
          assert.ok(error.message.includes('Invalid JSON payload'))
          return true
        }
      )

      rmSync(tmpDir, { recursive: true })
    })
  })
})
