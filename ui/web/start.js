import finalhandler from 'finalhandler'
import { readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { dirname, join } from 'node:path'
import { env } from 'node:process'
import { fileURLToPath } from 'node:url'
import serveStatic from 'serve-static'

const UI_DEV_SERVER_PORT = 3030

const isCFEnvironment = env.VCAP_APPLICATION != null
const PORT = isCFEnvironment ? Number.parseInt(env.PORT) : UI_DEV_SERVER_PORT
const uiPath = join(dirname(fileURLToPath(import.meta.url)), './dist')

const indexHtml = readFileSync(join(uiPath, 'index.html'))
const serve = serveStatic(uiPath)

const server = createServer((req, res) => {
  serve(req, res, () => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      finalhandler(req, res)()
      return
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(indexHtml)
  })
})

server.listen(PORT, () => console.info(`Web UI running at: http://localhost:${PORT}`))
