import assert from 'node:assert'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const cliPath = join(__dirname, '../../dist/cli.js')

const runCli = (args: string[]): Promise<{ code: number; stderr: string; stdout: string }> => {
  return new Promise(resolve => {
    const stdoutChunks: Buffer[] = []
    const stderrChunks: Buffer[] = []
    const child = spawn('node', [cliPath, ...args], {
      env: { ...process.env, NO_COLOR: '1' },
    })
    child.stdout.on('data', (chunk: Buffer) => stdoutChunks.push(chunk))
    child.stderr.on('data', (chunk: Buffer) => stderrChunks.push(chunk))
    child.on('close', code => {
      resolve({
        code: code ?? 1,
        stderr: Buffer.concat(stderrChunks).toString(),
        stdout: Buffer.concat(stdoutChunks).toString(),
      })
    })
  })
}

await describe('evse-cli integration tests', async () => {
  await it('should exit 0 and show help', async () => {
    assert.ok(existsSync(cliPath), `CLI not built: ${cliPath}`)
    const result = await runCli(['--help'])
    assert.strictEqual(result.code, 0)
    assert.ok(result.stdout.includes('evse-cli'), `Expected evse-cli in help: ${result.stdout}`)
    assert.ok(result.stdout.includes('simulator'), `Expected simulator command: ${result.stdout}`)
    assert.ok(result.stdout.includes('station'), `Expected station command: ${result.stdout}`)
  })

  await it('should exit 0 and show version', async () => {
    const result = await runCli(['--version'])
    assert.strictEqual(result.code, 0)
    assert.match(result.stdout, /\d+\.\d+\.\d+/)
  })

  await it('should exit 0 and show simulator subcommand help', async () => {
    const result = await runCli(['simulator', '--help'])
    assert.strictEqual(result.code, 0)
    assert.ok(result.stdout.includes('state'))
    assert.ok(result.stdout.includes('start'))
    assert.ok(result.stdout.includes('stop'))
  })

  await it('should exit 0 and show station subcommand help', async () => {
    const result = await runCli(['station', '--help'])
    assert.strictEqual(result.code, 0)
    assert.ok(result.stdout.includes('list'))
    assert.ok(result.stdout.includes('add'))
    assert.ok(result.stdout.includes('delete'))
  })

  await it('should exit 0 and show ocpp subcommand help with commands', async () => {
    const result = await runCli(['ocpp', '--help'])
    assert.strictEqual(result.code, 0)
    assert.ok(result.stdout.includes('authorize'))
    assert.ok(result.stdout.includes('heartbeat'))
    assert.ok(result.stdout.includes('transaction-event'))
  })

  await it('should exit 1 with connection error when no simulator running', async () => {
    const result = await runCli(['--url', 'ws://localhost:19999', 'simulator', 'state'])
    assert.strictEqual(result.code, 1)
    assert.ok(result.stderr.length > 0 || result.stdout.length > 0, 'Expected error output')
  })

  await it('should exit 1 and output JSON error in --json mode when no simulator running', async () => {
    const result = await runCli(['--url', 'ws://localhost:19999', '--json', 'simulator', 'state'])
    assert.strictEqual(result.code, 1)
  })

  await it('should exit 1 when required options missing (station add)', async () => {
    const result = await runCli(['station', 'add'])
    assert.strictEqual(result.code, 1)
  })
})
