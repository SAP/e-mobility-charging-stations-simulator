// eslint-disable-next-line n/no-unpublished-require
const RoboHydra = require('robohydra');
const RoboHydraHead = RoboHydra.heads.RoboHydraHead;
const RoboHydraWebSocketHead = RoboHydra.heads.RoboHydraWebSocketHead;
const RoboHydraWebSocketHeadProxy = RoboHydra.heads.RoboHydraWebSocketHeadProxy;

// eslint-disable-next-line no-unused-vars
exports.getBodyParts = function (conf) {
  let wsSocket;
  return {
    heads: [
      new RoboHydraHead({
        name: 'message',
        path: '/message',
        method: 'POST',
        handler: function (req, res) {
          const msg = JSON.stringify(req.body);
          if (wsSocket) {
            wsSocket.send(msg);
            res.send('Message sent');
          } else {
            res.send('Cannot send message, no opened websocket found');
          }
        },
      }),

      new RoboHydraHead({
        name: 'close',
        path: '/close',
        method: 'GET',
        handler: function (req, res) {
          if (wsSocket) {
            wsSocket.close();
            res.send('Websocket closed');
          } else {
            res.send('Cannot close websocket, no opened websocket found');
          }
        },
      }),

      new RoboHydraWebSocketHeadProxy({
        name: 'proxy',
        mountPath: '/proxy',
        proxyTo: 'ws://server.example.com',
        preProcessor: function (data) {
          console.info('From the client: ' + data);
        },
        postProcessor: function (data) {
          console.info('From the server: ' + data);
        },
      }),

      new RoboHydraWebSocketHead({
        name: 'WS Server',
        path: '/.*',
        handler: function (req, socket) {
          wsSocket = socket;
        },
      }),
    ],
  };
};
