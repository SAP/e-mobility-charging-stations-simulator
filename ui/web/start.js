const path = require('path'),
  finalhandler = require('finalhandler'),
  http = require('http'),
  serveStatic = require('serve-static');

const isCFEnvironment = process.env.VCAP_APPLICATION !== undefined,
  PORT = isCFEnvironment ? parseInt(process.env.PORT) : 3030,
  uiPath = path.join(__dirname, './dist');

const serve = serveStatic(uiPath);

const server = http.createServer(function onRequest(req, res) {
  serve(req, res, finalhandler(req, res));
});

server.listen(PORT, () => console.info(`App running at: http://localhost:${PORT}`));
