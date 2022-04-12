# [charging-stations-simulator](https://github.com/jerome-benoit/charging-stations-simulator)

## Summary

Simple [node.js](https://nodejs.org/) program to simulate a set of charging stations based on the OCPP-J 1.6 protocol.

## Prerequisites

### Windows

- [Chocolatey](https://chocolatey.org/):

```powershell
choco install -y nodejs-lts
```

### MacOSX

- [Homebrew](https://brew.sh/):

```shell
brew install node@16
```

### GNU/Linux:

- [NodeSource](https://github.com/nodesource/distributions) Node.js Binary Distributions for version 16.X

## Configuration files syntax

All configuration files are in the JSON standard format.

**Configuration files list**:

- charging stations simulator configuration: [src/assets/config.json](src/assets/config.json);
- charging station configuration templates: [src/assets/station-templates](src/assets/station-templates);
- charging station configurations: [dist/assets/configurations](dist/assets/configurations);
- charging station RFID tags lists in [src/assets](src/assets).

The charging stations simulator's configuration parameters must be within the `src/assets/config.json` file. A charging station simulator configuration template file is available at [src/assets/config-template.json](src/assets/config-template.json).

All charging station configuration templates are in the directory [src/assets/station-templates](src/assets/station-templates).

A list of RFID tags must be defined for the automatic transaction generator with a default location and name: `src/assets/authorization-tags.json`. A template file is available at [src/assets/authorization-tags-template.json](src/assets/authorization-tags-template.json).

**Configuration files hierarchy and priority**:

1. charging station configuration: [dist/assets/configurations](dist/assets/configurations);
2. charging station configuration template: [src/assets/station-templates](src/assets/station-templates);
3. charging stations simulator configuration: [src/assets/config.json](src/assets/config.json).

The charging stations simulator have an automatic configuration files reload feature at change for:

- charging stations simulator configuration;
- charging station configuration templates;
- charging station authorization RFID tags lists.

But the modifications to test have to be done to the files in the build result directory [dist/assets](dist/assets). Once the modifications are finished, they have to be reported or copied to the matching files in the build source directory [src/assets](src/assets) to ensure they will be taken into account at next build.

### Charging stations simulator configuration

**src/assets/config.json**:

| Key                        | Value(s)                                         | Default Value                                                               | Value type                                                                                 | Description                                                                                                                                             |
| -------------------------- | ------------------------------------------------ | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| supervisionUrls            |                                                  | []                                                                          | string \| string[]                                                                         | string or array of global connection URIs to OCPP-J servers                                                                                             |
| supervisionUrlDistribution | round-robin/random/sequential                    | round-robin                                                                 | boolean                                                                                    | supervision urls distribution policy to simulated charging stations                                                                                     |
| workerProcess              | workerSet/staticPool/dynamicPool                 | workerSet                                                                   | string                                                                                     | worker threads process type                                                                                                                             |
| workerStartDelay           |                                                  | 500                                                                         | integer                                                                                    | milliseconds to wait at worker threads startup (only for workerSet threads process type)                                                                |
| elementStartDelay          |                                                  | 0                                                                           | integer                                                                                    | milliseconds to wait at charging station startup                                                                                                        |
| workerPoolMinSize          |                                                  | 4                                                                           | integer                                                                                    | worker threads pool minimum number of threads                                                                                                           |
| workerPoolMaxSize          |                                                  | 16                                                                          | integer                                                                                    | worker threads pool maximum number of threads                                                                                                           |
| workerPoolStrategy         | ROUND_ROBIN/LESS_RECENTLY_USED/...               | [poolifier](https://github.com/poolifier/poolifier) default: ROUND_ROBBIN   | string                                                                                     | worker threads pool [poolifier](https://github.com/poolifier/poolifier) worker choice strategy                                                          |
| chargingStationsPerWorker  |                                                  | 1                                                                           | integer                                                                                    | number of charging stations per worker threads for the `workerSet` process type                                                                         |
| logStatisticsInterval      |                                                  | 60                                                                          | integer                                                                                    | seconds between charging stations statistics output in the logs                                                                                         |
| logConsole                 | true/false                                       | false                                                                       | boolean                                                                                    | output logs on the console                                                                                                                              |
| logFormat                  |                                                  | simple                                                                      | string                                                                                     | winston log format                                                                                                                                      |
| logRotate                  | true/false                                       | true                                                                        | boolean                                                                                    | enable daily log files rotation                                                                                                                         |
| logMaxFiles                |                                                  | 7                                                                           | integer                                                                                    | maximum number of log files to keep                                                                                                                     |
| logLevel                   | emerg/alert/crit/error/warning/notice/info/debug | info                                                                        | string                                                                                     | winston logging level                                                                                                                                   |
| logFile                    |                                                  | combined.log                                                                | string                                                                                     | log file relative path                                                                                                                                  |
| logErrorFile               |                                                  | error.log                                                                   | string                                                                                     | error log file relative path                                                                                                                            |
| uiWebSocketServer          |                                                  | { "enabled": true, "options": { "host: "localhost", "port": 8080 } }        | { enabled: boolean; options: ServerOptions; }                                              | UI WebSocket server configuration section                                                                                                               |
| performanceStorage         |                                                  | { "enabled": false, "type": "jsonfile", "file:///performanceRecords.json" } | { enabled: boolean; type: string; URI: string; } where type can be 'jsonfile' or 'mongodb' | performance storage configuration section                                                                                                               |
| stationTemplateUrls        |                                                  | {}[]                                                                        | { file: string; numberOfStations: number; }[]                                              | array of charging station configuration templates URIs configuration section (charging station configuration template file name and number of stations) |

#### Worker process model:

- **workerSet**:
  Worker set executing each a static number (chargingStationsPerWorker) of simulated charging stations from the total

- **staticPool**:
  Statically sized worker pool executing a static total number of simulated charging stations

- **dynamicPool**:
  Dynamically sized worker pool executing a static total number of simulated charging stations

### Charging station configuration template

**src/assets/station-templates/\<name\>.json**:

| Key                               | Value(s)   | Default Value   | Value type                        | Description                                                                                                                                                                    |
| --------------------------------- | ---------- | --------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| supervisionUrls                   |            | ''              | string \| string[]                | string or array of connection URIs to OCPP-J servers                                                                                                                           |
| supervisionUser                   |            | ''              | string                            | basic HTTP authentication user to OCPP-J server                                                                                                                                |
| supervisionPassword               |            | ''              | string                            | basic HTTP authentication password to OCPP-J server                                                                                                                            |
| supervisionUrlOcppConfiguration   | true/false | false           | boolean                           | allow supervision URL configuration via a vendor OCPP parameter key                                                                                                            |
| supervisionUrlOcppKey             |            | 'ConnectionUrl' | string                            | the vendor string that will be used as a vendor OCPP parameter key to set the supervision URL                                                                                  |
| ocppVersion                       | 1.6        | 1.6             | string                            | OCPP version                                                                                                                                                                   |
| ocppProtocol                      | json       | json            | string                            | OCPP protocol                                                                                                                                                                  |
| ocppStrictCompliance              | true/false | false           | boolean                           | strict adherence to the OCPP version and protocol specifications                                                                                                               |
| ocppPersistentConfiguration       | true/false | true            | boolean                           | enable persistent OCPP parameters storage by charging stations 'hashId'. The persistency is ensured by the charging stations configuration files in dist/assets/configurations |
| wsOptions                         |            | {}              | ClientOptions & ClientRequestArgs | [ws](https://github.com/websockets/ws) and node.js [http](https://nodejs.org/api/http.html) clients options intersection                                                       |
| authorizationFile                 |            | ''              | string                            | RFID tags list file relative to src/assets path                                                                                                                                |
| baseName                          |            | ''              | string                            | base name to build charging stations id                                                                                                                                        |
| nameSuffix                        |            | ''              | string                            | name suffix to build charging stations id                                                                                                                                      |
| fixedName                         | true/false | false           | boolean                           | use the baseName as the charging stations unique name                                                                                                                          |
| chargePointModel                  |            | ''              | string                            | charging stations model                                                                                                                                                        |
| chargePointVendor                 |            | ''              | string                            | charging stations vendor                                                                                                                                                       |
| chargePointSerialNumberPrefix     |            | ''              | string                            | charge point serial number prefix                                                                                                                                              |
| chargeBoxSerialNumberPrefix       |            | ''              | string                            | charge box serial number prefix (deprecated in OCPP 1.6)                                                                                                                       |
| firmwareVersion                   |            | ''              | string                            | charging stations firmware version                                                                                                                                             |
| power                             |            |                 | float \| float[]                  | charging stations maximum power value(s)                                                                                                                                       |
| powerSharedByConnectors           | true/false | false           | boolean                           | charging stations power shared by its connectors                                                                                                                               |
| powerUnit                         | W/kW       | W               | string                            | charging stations power unit                                                                                                                                                   |
| currentOutType                    | AC/DC      | AC              | string                            | charging stations current out type                                                                                                                                             |
| voltageOut                        |            | AC:230/DC:400   | integer                           | charging stations voltage out                                                                                                                                                  |
| numberOfPhases                    | 0/1/3      | AC:3/DC:0       | integer                           | charging stations number of phase(s)                                                                                                                                           |
| numberOfConnectors                |            |                 | integer \| integer[]              | charging stations number of connector(s)                                                                                                                                       |
| useConnectorId0                   | true/false | true            | boolean                           | use connector id 0 definition from the charging station configuration template                                                                                                 |
| randomConnectors                  | true/false | false           | boolean                           | randomize runtime connector id affectation from the connector id definition in charging station configuration template                                                         |
| resetTime                         |            | 60              | integer                           | seconds to wait before the charging stations come back at reset                                                                                                                |
| autoRegister                      | true/false | false           | boolean                           | set charging stations as registered at boot notification for testing purpose                                                                                                   |
| autoReconnectMaxRetries           |            | -1 (unlimited)  | integer                           | connection retries to the OCPP-J server                                                                                                                                        |
| reconnectExponentialDelay         | true/false | false           | boolean                           | connection delay retry to the OCPP-J server                                                                                                                                    |
| registrationMaxRetries            |            | -1 (unlimited)  | integer                           | charging stations boot notification retries                                                                                                                                    |
| amperageLimitationOcppKey         |            | undefined       | string                            | charging stations OCPP parameter key used to set the amperage limit, per phase for each connector on AC and global for DC                                                      |
| amperageLimitationUnit            | A/cA/dA/mA | A               | string                            | charging stations amperage limit unit                                                                                                                                          |
| enableStatistics                  | true/false | true            | boolean                           | enable charging stations statistics                                                                                                                                            |
| mayAuthorizeAtRemoteStart         | true/false | true            | boolean                           | always send authorize at remote start transaction when AuthorizeRemoteTxRequests is enabled                                                                                    |
| beginEndMeterValues               | true/false | false           | boolean                           | enable Transaction.{Begin,End} MeterValues                                                                                                                                     |
| outOfOrderEndMeterValues          | true/false | false           | boolean                           | send Transaction.End MeterValues out of order. Need to relax OCPP specifications strict compliance ('ocppStrictCompliance' parameter)                                          |
| meteringPerTransaction            | true/false | true            | boolean                           | enable metering history on a per transaction basis                                                                                                                             |
| transactionDataMeterValues        | true/false | false           | boolean                           | enable transaction data MeterValues at stop transaction                                                                                                                        |
| mainVoltageMeterValues            | true/false | true            | boolean                           | include charging stations main voltage MeterValues on three phased charging stations                                                                                           |
| phaseLineToLineVoltageMeterValues | true/false | true            | boolean                           | include charging stations line to line voltage MeterValues on three phased charging stations                                                                                   |
| Configuration                     |            |                 | ChargingStationConfiguration      | charging stations OCPP parameters configuration section                                                                                                                        |
| AutomaticTransactionGenerator     |            |                 | AutomaticTransactionGenerator     | charging stations ATG configuration section                                                                                                                                    |
| Connectors                        |            |                 | Connectors                        | charging stations connectors configuration section                                                                                                                             |

#### Configuration section

```json
  "Configuration": {
    "configurationKey": [
       ...
       {
        "key": "StandardKey",
        "readonly": false,
        "value": "StandardValue",
        "visible": true,
        "reboot": false
      },
      ...
      {
        "key": "VendorKey",
        "readonly": false,
        "value": "VendorValue",
        "visible": false,
        "reboot": true
      },
      ...
    ]
  }
```

#### AutomaticTransactionGenerator section

```json
  "AutomaticTransactionGenerator": {
    "enable": false,
    "minDuration": 60,
    "maxDuration": 80,
    "minDelayBetweenTwoTransactions": 15,
    "maxDelayBetweenTwoTransactions": 30,
    "probabilityOfStart": 1,
    "stopAfterHours": 0.3,
    "stopOnConnectionFailure": true,
    "requireAuthorize": true
  }
```

#### Connectors section

```json
  "Connectors": {
    "0": {},
    "1": {
      "bootStatus": "Available",
      "MeterValues": [
        ...
        {
          "unit": "W",
          "measurand": "Power.Active.Import",
          "phase": "L1-N",
          "value": "5000",
          "fluctuationPercent": "10"
        },
        ...
        {
          "unit": "A",
          "measurand": "Current.Import"
        },
        ...
        {
          "unit": "Wh"
        },
        ...
      ]
    }
  },
```

### Charging station configuration

**dist/assets/configurations/\<hashId\>.json**:

The charging station configuration file is automatically generated at startup from the charging station configuration template file and is persistent.

The charging station configuration file content can be regenerated partially on matching charging station configuration template file changes. The charging station serial number is kept unchanged.

#### stationInfo section

The syntax is similar to charging station configuration template with some added fields like the charging station id (name) and the 'Configuration' section removed.

#### configurationKey section

The syntax is similar to the charging station configuration template 'Configuration' section.

## Start

To start the program, run: `npm start`.

To start the program with a UI controller, run: `npm start:server`.
Then, start/stop the simulator connections by going to `https://<hostname:port>` in a browser. Localhost port will default to 8080. For BTP, the port is assigned based on the process.env.PORT environment variable.

## Docker

In the [docker](./docker) folder:

```bash
make
```

Or with the optional git submodules:

```bash
make SUBMODULES_INIT=true
```

## OCPP-J commands supported

### Version 1.6

#### Core Profile

- :white_check_mark: Authorize
- :white_check_mark: BootNotification
- :white_check_mark: ChangeAvailability
- :white_check_mark: ChangeConfiguration
- :white_check_mark: ClearCache
- :x: DataTransfer
- :white_check_mark: GetConfiguration
- :white_check_mark: Heartbeat
- :white_check_mark: MeterValues
- :white_check_mark: RemoteStartTransaction
- :white_check_mark: RemoteStopTransaction
- :white_check_mark: Reset
- :white_check_mark: StartTransaction
- :white_check_mark: StatusNotification
- :white_check_mark: StopTransaction
- :white_check_mark: UnlockConnector

#### Firmware Management Profile

- :white_check_mark: GetDiagnostics
- :white_check_mark: DiagnosticsStatusNotification
- :x: FirmwareStatusNotification
- :x: UpdateFirmware

#### Local Auth List Management Profile

- :x: GetLocalListVersion
- :x: SendLocalList

#### Reservation Profile

- :x: CancelReservation
- :x: ReserveNow

#### Smart Charging Profile

- :white_check_mark: ClearChargingProfile
- :x: GetCompositeSchedule
- :white_check_mark: SetChargingProfile

#### Remote Trigger Profile

- :white_check_mark: TriggerMessage

## OCPP-J standard parameters supported

All kind of OCPP parameters are supported in a charging station configuration or a charging station configuration template file. The list here mention the standard ones also handled automatically in the simulator.

### Version 1.6

#### Core Profile

- :white_check_mark: AuthorizeRemoteTxRequests (type: boolean) (units: -)
- :x: ClockAlignedDataInterval (type: integer) (units: seconds)
- :white_check_mark: ConnectionTimeOut (type: integer) (units: seconds)
- :x: GetConfigurationMaxKeys (type: integer) (units: -)
- :white_check_mark: HeartbeatInterval (type: integer) (units: seconds)
- :x: LocalAuthorizeOffline (type: boolean) (units: -)
- :x: LocalPreAuthorize (type: boolean) (units: -)
- :x: MeterValuesAlignedData (type: CSL) (units: -)
- :white_check_mark: MeterValuesSampledData (type: CSL) (units: -)
- :white_check_mark: MeterValueSampleInterval (type: integer) (units: seconds)
- :white_check_mark: NumberOfConnectors (type: integer) (units: -)
- :x: ResetRetries (type: integer) (units: times)
- :white_check_mark: ConnectorPhaseRotation (type: CSL) (units: -)
- :x: StopTransactionOnEVSideDisconnect (type: boolean) (units: -)
- :x: StopTransactionOnInvalidId (type: boolean) (units: -)
- :x: StopTxnAlignedData (type: CSL) (units: -)
- :x: StopTxnSampledData (type: CSL) (units: -)
- :white_check_mark: SupportedFeatureProfiles (type: CSL) (units: -)
- :x: TransactionMessageAttempts (type: integer) (units: times)
- :x: TransactionMessageRetryInterval (type: integer) (units: seconds)
- :x: UnlockConnectorOnEVSideDisconnect (type: boolean) (units: -)
- :white_check_mark: WebSocketPingInterval (type: integer) (units: seconds)

#### Firmware Management Profile

- _none_

#### Local Auth List Management Profile

- :white_check_mark: LocalAuthListEnabled (type: boolean) (units: -)
- :x: LocalAuthListMaxLength (type: integer) (units: -)
- :x: SendLocalListMaxLength (type: integer) (units: -)

#### Reservation Profile

- _none_

#### Smart Charging Profile

- :x: ChargeProfileMaxStackLevel (type: integer) (units: -)
- :x: ChargingScheduleAllowedChargingRateUnit (type: CSL) (units: -)
- :x: ChargingScheduleMaxPeriods (type: integer) (units: -)
- :x: MaxChargingProfilesInstalled (type: integer) (units: -)

#### Remote Trigger Profile

- _none_

## License

This file and all other files in this repository are licensed under the Apache Software License, v.2 and copyrighted under the copyright in [NOTICE](NOTICE) file, except as noted otherwise in the [LICENSE](LICENSE) file or the code source file header.

Please note that Docker images can contain other software which may be licensed under different licenses. This LICENSE and NOTICE files are also included in the Docker image. For any usage of built Docker images please make sure to check the licenses of the artifacts contained in the images.
