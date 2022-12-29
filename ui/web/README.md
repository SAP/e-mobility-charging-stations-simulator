# Web UI

## Project setup

```shell
npm install
```

The simulator UI server must be enabled, use WebSocket and disable authentication. The simulator main configuration file should have a `uiServer` section like this:

```json
  "uiServer": {
    "enabled": true,
    "type": "ws",
    "authentication": {
      "enabled": false,
      "type": "basic-auth",
      "username": "admin",
      "password": "admin"
    }
  },
```

See [here](../README.md#charging-stations-simulator-configuration) for more details.

### Run

For both solution you can then follow the link displayed in the terminal at the end of compilation

#### Compiles and run for production

```shell
npm start
```

#### Compiles and run for development

```shell
npm run serve
```

### Compiles and minifies for production

```shell
npm run build
```

### Lints files

```shell
npm run lint
```
