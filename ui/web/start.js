const http = require('node:http'),
  path = require('node:path'),
  { env } = require('node:process'),
  finalhandler = require('finalhandler'),
  serveStatic = require('serve-static');

const isCFEnvironment = env.VCAP_APPLICATION !== undefined,
  PORT = isCFEnvironment ? parseInt(env.PORT) : 3030,
  uiPath = path.join(__dirname, './dist');

const serve = serveStatic(uiPath);

const server = http.createServer(function onRequest(req, res) {
  serve(req, res, finalhandler(req, res));
});

server.listen(PORT, () => console.info(`App running at: http://localhost:${PORT}`));
