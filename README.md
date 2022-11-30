<!-- markdownlint-disable-file MD033 MD024 -->

# [e-mobility charging stations simulator](https://github.com/sap/e-mobility-charging-stations-simulator)

[![REUSE status](https://api.reuse.software/badge/github.com/SAP/e-mobility-charging-stations-simulator)](https://api.reuse.software/info/github.com/SAP/e-mobility-charging-stations-simulator)

## Summary

Simple [node.js](https://nodejs.org/) software to simulate and scale a set of charging stations based on the OCPP-J 1.6 protocol as part of SAP e-Mobility solution.

## Prerequisites

Install the [node.js](https://nodejs.org/) LTS runtime environment:

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

### GNU/Linux

- [NodeSource](https://github.com/nodesource/distributions) Node.js Binary Distributions for version >= 16.X

## Installation

In the repository root, run the following command:

```shell
npm install
```

## Initial configuration

Copy the configuration template file [src/assets/config-template.json](src/assets/config-template.json) to [src/assets/config.json](src/assets/config.json).  
Copy the authorization RFID tags template file [src/assets/authorization-tags-template.json](src/assets/authorization-tags-template.json) to [src/assets/authorization-tags.json](src/assets/authorization-tags.json).

Tweak them to your needs by following the section [configuration files syntax](README.md#configuration-files-syntax).

## Start

To start the program, run: `npm start`.

## Start Web UI

See Web UI [README.md](ui/web/README.md) for more information.

## Configuration files syntax

All configuration files are in the JSON standard format.

**Configuration files locations**:

- charging stations simulator configuration: [src/assets/config.json](src/assets/config.json);
- charging station configuration templates: [src/assets/station-templates](src/assets/station-templates);
- charging station configurations: [dist/assets/configurations](dist/assets/configurations);
- charging station RFID tags lists: [src/assets](src/assets).

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

But the modifications to test have to be done to the files in the build target directory [dist/assets](dist/assets). Once the modifications are finished, they have to be reported or copied to the matching files in the build source directory [src/assets](src/assets) to ensure they will be taken into account at next build.

### Charging stations simulator configuration

**src/assets/config.json**:

| Key                        | Value(s)                                         | Default Value                                                                                                                                                                                                 | Value type                                                                                                                                                                                                                          | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| -------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| supervisionUrls            |                                                  | []                                                                                                                                                                                                            | string \| string[]                                                                                                                                                                                                                  | string or array of global connection URIs to OCPP-J servers                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| supervisionUrlDistribution | round-robin/random/charging-station-affinity     | charging-station-affinity                                                                                                                                                                                     | boolean                                                                                                                                                                                                                             | supervision urls distribution policy to simulated charging stations                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| logStatisticsInterval      |                                                  | 60                                                                                                                                                                                                            | integer                                                                                                                                                                                                                             | seconds between charging stations statistics output in the logs                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| logConsole                 | true/false                                       | false                                                                                                                                                                                                         | boolean                                                                                                                                                                                                                             | output logs on the console                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| logFormat                  |                                                  | simple                                                                                                                                                                                                        | string                                                                                                                                                                                                                              | winston log format                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| logRotate                  | true/false                                       | true                                                                                                                                                                                                          | boolean                                                                                                                                                                                                                             | enable daily log files rotation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| logMaxFiles                |                                                  | 7                                                                                                                                                                                                             | integer                                                                                                                                                                                                                             | maximum number of log files to keep                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| logLevel                   | emerg/alert/crit/error/warning/notice/info/debug | info                                                                                                                                                                                                          | string                                                                                                                                                                                                                              | winston logging level                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| logFile                    |                                                  | combined.log                                                                                                                                                                                                  | string                                                                                                                                                                                                                              | log file relative path                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| logErrorFile               |                                                  | error.log                                                                                                                                                                                                     | string                                                                                                                                                                                                                              | error log file relative path                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| worker                     |                                                  | {<br />"processType": "workerSet",<br />"startDelay": 500,<br />"elementStartDelay": 0,<br />"elementsPerWorker": 1,<br />"poolMinSize": 4,<br />"poolMaxSize": 16,<br />"poolStrategy": "ROUND_ROBIN"<br />} | {<br />processType: WorkerProcessType;<br />startDelay: number;<br />elementStartDelay: number;<br />elementsPerWorker: number;<br />poolMinSize: number;<br />poolMaxSize: number;<br />poolStrategy: WorkerChoiceStrategy;<br />} | Worker configuration section:<br />- processType: worker threads process type (workerSet/staticPool/dynamicPool)<br />- startDelay: milliseconds to wait at worker threads startup (only for workerSet threads process type)<br />- elementStartDelay: milliseconds to wait at charging station startup<br />- elementsPerWorker: number of charging stations per worker threads for the `workerSet` process type<br />- poolMinSize: worker threads pool minimum number of threads</br >- poolMaxSize: worker threads pool maximum number of threads<br />- poolStrategy: worker threads pool [poolifier](https://github.com/poolifier/poolifier) worker choice strategy |
| uiServer                   |                                                  | {<br />"enabled": true,<br />"type": "ws",<br />"options": {<br />"host": "localhost",<br />"port": 8080<br />}<br />}                                                                                        | {<br />enabled: boolean;<br />type: ApplicationProtocol;<br />options: ServerOptions;<br />authentication: {<br />enabled: boolean;<br />type: AuthenticationType;<br />username: string;<br />password: string;<br />}<br />}      | UI server configuration section                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| performanceStorage         |                                                  | {<br />"enabled": false,<br />"type": "jsonfile",<br />"file:///performanceRecords.json"<br />}                                                                                                               | {<br />enabled: boolean;<br />type: string;<br />URI: string;<br />}<br />where type can be 'jsonfile' or 'mongodb'                                                                                                                 | performance storage configuration section                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| stationTemplateUrls        |                                                  | {}[]                                                                                                                                                                                                          | {<br />file: string;<br />numberOfStations: number;<br />}[]                                                                                                                                                                        | array of charging station configuration templates URIs configuration section (charging station configuration template file name and number of stations)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |

#### Worker process model

- **workerSet**:
  Worker set executing each a static number (elementsPerWorker) of simulated charging stations from the total

- **staticPool**:
  Statically sized worker pool executing a static total number of simulated charging stations

- **dynamicPool**:
  Dynamically sized worker pool executing a static total number of simulated charging stations

### Charging station configuration template

**src/assets/station-templates/\<name\>.json**:

| Key                                | Value(s)   | Default Value                                                     | Value type                                                                                                                         | Description                                                                                                                                                                                           |
| ---------------------------------- | ---------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| supervisionUrls                    |            | ''                                                                | string \| string[]                                                                                                                 | string or array of connection URIs to OCPP-J servers                                                                                                                                                  |
| supervisionUser                    |            | ''                                                                | string                                                                                                                             | basic HTTP authentication user to OCPP-J server                                                                                                                                                       |
| supervisionPassword                |            | ''                                                                | string                                                                                                                             | basic HTTP authentication password to OCPP-J server                                                                                                                                                   |
| supervisionUrlOcppConfiguration    | true/false | false                                                             | boolean                                                                                                                            | allow supervision URL configuration via a vendor OCPP parameter key                                                                                                                                   |
| supervisionUrlOcppKey              |            | 'ConnectionUrl'                                                   | string                                                                                                                             | the vendor string that will be used as a vendor OCPP parameter key to set the supervision URL                                                                                                         |
| ocppVersion                        | 1.6        | 1.6                                                               | string                                                                                                                             | OCPP version                                                                                                                                                                                          |
| ocppProtocol                       | json       | json                                                              | string                                                                                                                             | OCPP protocol                                                                                                                                                                                         |
| ocppStrictCompliance               | true/false | false                                                             | boolean                                                                                                                            | strict adherence to the OCPP version and protocol specifications                                                                                                                                      |
| ocppPersistentConfiguration        | true/false | true                                                              | boolean                                                                                                                            | enable persistent OCPP parameters storage by charging stations 'hashId'. The persistency is ensured by the charging stations configuration files in dist/assets/configurations                        |
| stationInfoPersistentConfiguration | true/false | true                                                              | boolean                                                                                                                            | enable persistent station information and specifications storage by charging stations 'hashId'. The persistency is ensured by the charging stations configuration files in dist/assets/configurations |
| wsOptions                          |            | {}                                                                | ClientOptions & ClientRequestArgs                                                                                                  | [ws](https://github.com/websockets/ws) and node.js [http](https://nodejs.org/api/http.html) clients options intersection                                                                              |
| authorizationFile                  |            | ''                                                                | string                                                                                                                             | RFID tags list file relative to src/assets path                                                                                                                                                       |
| baseName                           |            | ''                                                                | string                                                                                                                             | base name to build charging stations id                                                                                                                                                               |
| nameSuffix                         |            | ''                                                                | string                                                                                                                             | name suffix to build charging stations id                                                                                                                                                             |
| fixedName                          | true/false | false                                                             | boolean                                                                                                                            | use the baseName as the charging stations unique name                                                                                                                                                 |
| chargePointModel                   |            | ''                                                                | string                                                                                                                             | charging stations model                                                                                                                                                                               |
| chargePointVendor                  |            | ''                                                                | string                                                                                                                             | charging stations vendor                                                                                                                                                                              |
| chargePointSerialNumberPrefix      |            | ''                                                                | string                                                                                                                             | charge point serial number prefix                                                                                                                                                                     |
| chargeBoxSerialNumberPrefix        |            | ''                                                                | string                                                                                                                             | charge box serial number prefix (deprecated in OCPP 1.6)                                                                                                                                              |
| firmwareVersion                    |            | ''                                                                | string                                                                                                                             | charging stations firmware version                                                                                                                                                                    |
| power                              |            |                                                                   | float \| float[]                                                                                                                   | charging stations maximum power value(s)                                                                                                                                                              |
| powerSharedByConnectors            | true/false | false                                                             | boolean                                                                                                                            | charging stations power shared by its connectors                                                                                                                                                      |
| powerUnit                          | W/kW       | W                                                                 | string                                                                                                                             | charging stations power unit                                                                                                                                                                          |
| currentOutType                     | AC/DC      | AC                                                                | string                                                                                                                             | charging stations current out type                                                                                                                                                                    |
| voltageOut                         |            | AC:230/DC:400                                                     | integer                                                                                                                            | charging stations voltage out                                                                                                                                                                         |
| numberOfPhases                     | 0/1/3      | AC:3/DC:0                                                         | integer                                                                                                                            | charging stations number of phase(s)                                                                                                                                                                  |
| numberOfConnectors                 |            |                                                                   | integer \| integer[]                                                                                                               | charging stations number of connector(s)                                                                                                                                                              |
| useConnectorId0                    | true/false | true                                                              | boolean                                                                                                                            | use connector id 0 definition from the charging station configuration template                                                                                                                        |
| randomConnectors                   | true/false | false                                                             | boolean                                                                                                                            | randomize runtime connector id affectation from the connector id definition in charging station configuration template                                                                                |
| resetTime                          |            | 60                                                                | integer                                                                                                                            | seconds to wait before the charging stations come back at reset                                                                                                                                       |
| autoRegister                       | true/false | false                                                             | boolean                                                                                                                            | set charging stations as registered at boot notification for testing purpose                                                                                                                          |
| autoReconnectMaxRetries            |            | -1 (unlimited)                                                    | integer                                                                                                                            | connection retries to the OCPP-J server                                                                                                                                                               |
| reconnectExponentialDelay          | true/false | false                                                             | boolean                                                                                                                            | connection delay retry to the OCPP-J server                                                                                                                                                           |
| registrationMaxRetries             |            | -1 (unlimited)                                                    | integer                                                                                                                            | charging stations boot notification retries                                                                                                                                                           |
| amperageLimitationOcppKey          |            | undefined                                                         | string                                                                                                                             | charging stations OCPP parameter key used to set the amperage limit, per phase for each connector on AC and global for DC                                                                             |
| amperageLimitationUnit             | A/cA/dA/mA | A                                                                 | string                                                                                                                             | charging stations amperage limit unit                                                                                                                                                                 |
| enableStatistics                   | true/false | true                                                              | boolean                                                                                                                            | enable charging stations statistics                                                                                                                                                                   |
| mustAuthorizeAtRemoteStart         | true/false | true                                                              | boolean                                                                                                                            | always send authorize at remote start transaction when AuthorizeRemoteTxRequests is enabled                                                                                                           |
| payloadSchemaValidation            | true/false | true                                                              | boolean                                                                                                                            | validate OCPP commands PDU against [OCA](https://www.openchargealliance.org/) JSON schemas                                                                                                            |
| beginEndMeterValues                | true/false | false                                                             | boolean                                                                                                                            | enable Transaction.{Begin,End} MeterValues                                                                                                                                                            |
| outOfOrderEndMeterValues           | true/false | false                                                             | boolean                                                                                                                            | send Transaction.End MeterValues out of order. Need to relax OCPP specifications strict compliance ('ocppStrictCompliance' parameter)                                                                 |
| meteringPerTransaction             | true/false | true                                                              | boolean                                                                                                                            | enable metering history on a per transaction basis                                                                                                                                                    |
| transactionDataMeterValues         | true/false | false                                                             | boolean                                                                                                                            | enable transaction data MeterValues at stop transaction                                                                                                                                               |
| mainVoltageMeterValues             | true/false | true                                                              | boolean                                                                                                                            | include charging stations main voltage MeterValues on three phased charging stations                                                                                                                  |
| phaseLineToLineVoltageMeterValues  | true/false | true                                                              | boolean                                                                                                                            | include charging stations line to line voltage MeterValues on three phased charging stations                                                                                                          |
| customValueLimitationMeterValues   | true/false | true                                                              | boolean                                                                                                                            | enable limitation on custom fluctuated value in MeterValues                                                                                                                                           |
| commandsSupport                    |            | {<br />"incomingCommands": {},<br />"outgoingCommands": {}<br />} | {<br /> incomingCommands: Record<IncomingRequestCommand, boolean>;<br />outgoingCommands?: Record<RequestCommand, boolean>;<br />} | Configuration section for OCPP commands support. Empty section or subsections means all implemented OCPP commands are supported                                                                       |
| messageTriggerSupport              |            | {}                                                                | Record<MessageTrigger, boolean>                                                                                                    | Configuration section for OCPP commands trigger support. Empty section means all implemented OCPP trigger commands are supported                                                                      |
| Configuration                      |            |                                                                   | ChargingStationConfiguration                                                                                                       | charging stations OCPP parameters configuration section                                                                                                                                               |
| AutomaticTransactionGenerator      |            |                                                                   | AutomaticTransactionGenerator                                                                                                      | charging stations ATG configuration section                                                                                                                                                           |
| Connectors                         |            |                                                                   | Connectors                                                                                                                         | charging stations connectors configuration section                                                                                                                                                    |

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

Section type definition:

```ts
type AutomaticTransactionGeneratorConfiguration = {
  enable: boolean;
  minDuration: number;
  maxDuration: number;
  minDelayBetweenTwoTransactions: number;
  maxDelayBetweenTwoTransactions: number;
  probabilityOfStart: number;
  stopAfterHours: number;
  stopOnConnectionFailure: boolean;
  requireAuthorize?: boolean;
  idTagDistribution?: 'random' | 'round-robin' | 'connector-affinity';
};
```

Section example:

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
    "requireAuthorize": true,
    "idTagDistribution": "random"
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
- :white_check_mark: DataTransfer
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

## UI protocol

Protocol to control the simulator via a Websocket or HTTP server.

### HTTP Protocol

To learn how to use the HTTP protocol to pilot the simulator, an [Insomnia](https://insomnia.rest/) requests collection is available in [src/assets/ui-protocol](./src/assets/ui-protocol) directory.

### Websocket Protocol

SRPC protocol over Websocket. PDU stands for 'Protocol Data Unit'.

- Request:  
  [`uuid`, `ProcedureName`, `PDU`]  
  `uuid`: String uniquely representing this request  
  `ProcedureName`: The procedure to run on the simulator  
  `PDU`: The parameters for said procedure

- Response:  
  [`uuid`, `PDU`]  
  `uuid`: String uniquely linking the response to the request  
  `PDU`: Response parameters to requested procedure

#### Version 0.0.1

Set the Websocket header _Sec-Websocket-Protocol_ to `ui0.0.1`.

##### Procedures

###### Start Simulator

- Request:  
  `ProcedureName`: 'startSimulator'  
  `PDU`: {}

- Response:  
  `PDU`: {  
  `status`: 'success' | 'failure'  
  }

###### Stop Simulator

- Request:  
  `ProcedureName`: 'stopSimulator'  
  `PDU`: {}

- Response:  
  `PDU`: {  
  `status`: 'success' | 'failure'  
  }

###### List Charging Stations

- Request:  
  `ProcedureName`: 'listChargingStations'  
  `PDU`: {}

- Response:  
  `PDU`: {  
  `status`: 'success' | 'failure',  
  `chargingStations`: ChargingStationData[]  
  }

###### Start Charging Station

- Request:  
  `ProcedureName`: 'startChargingStation'  
  `PDU`: {  
  `hashIds`: charging station unique identifier strings array (optional, default: all charging stations)  
  }

- Response:  
  `PDU`: {  
  `status`: 'success' | 'failure',  
  `hashIdsSucceeded`: charging station unique identifier strings array,  
  `hashIdsFailed`: charging station unique identifier strings array (optional)  
  `responsesFailed`: failed responses payload array (optional)  
  }

###### Stop Charging Station

- Request:  
  `ProcedureName`: 'stopChargingStation'  
  `PDU`: {  
  `hashIds`: charging station unique identifier strings array (optional, default: all charging stations)  
  }

- Response:  
  `PDU`: {  
  `status`: 'success' | 'failure',  
  `hashIdsSucceeded`: charging station unique identifier strings array,  
  `hashIdsFailed`: charging station unique identifier strings array (optional),  
  `responsesFailed`: failed responses payload array (optional)  
  }

###### Open Connection

- Request:  
  `ProcedureName`: 'openConnection'  
  `PDU`: {  
  `hashIds`: charging station unique identifier strings array (optional, default: all charging stations)  
  }

- Response:  
  `PDU`: {  
  `status`: 'success' | 'failure',  
  `hashIdsSucceeded`: charging station unique identifier strings array,  
  `hashIdsFailed`: charging station unique identifier strings array (optional),  
  `responsesFailed`: failed responses payload array (optional)  
  }

###### Close Connection

- Request:  
  `ProcedureName`: 'closeConnection'  
  `PDU`: {  
  `hashIds`: charging station unique identifier strings array (optional, default: all charging stations)  
  }

- Response:  
  `PDU`: {  
  `status`: 'success' | 'failure',  
  `hashIdsSucceeded`: charging station unique identifier strings array,  
  `hashIdsFailed`: charging station unique identifier strings array (optional),  
  `responsesFailed`: failed responses payload array (optional)  
  }

###### Start Automatic Transaction Generator

- Request:  
  `ProcedureName`: 'startAutomaticTransactionGenerator'  
  `PDU`: {  
  `hashIds`: charging station unique identifier strings array (optional, default: all charging stations),  
  `connectorIds`: connector id integer array (optional, default: all connectors)  
  }

- Response:  
  `PDU`: {  
  `status`: 'success' | 'failure',  
  `hashIdsSucceeded`: charging station unique identifier strings array,  
  `hashIdsFailed`: charging station unique identifier strings array (optional),  
  `responsesFailed`: failed responses payload array (optional)  
  }

###### Stop Automatic Transaction Generator

- Request:  
  `ProcedureName`: 'stopAutomaticTransactionGenerator'  
  `PDU`: {  
  `hashIds`: charging station unique identifier strings array (optional, default: all charging stations),  
  `connectorIds`: connector id integer array (optional, default: all connectors)  
  }

- Response:  
  `PDU`: {  
  `status`: 'success' | 'failure',  
  `hashIdsSucceeded`: charging station unique identifier strings array,  
  `hashIdsFailed`: charging station unique identifier strings array (optional),  
  `responsesFailed`: failed responses payload array (optional)  
  }

###### OCPP commands trigger

- Request:  
  `ProcedureName`: 'commandName' (the OCPP command name in camel case)  
  `PDU`: {  
   `hashIds`: charging station unique identifier strings array (optional, default: all charging stations),  
   ...`commandPayload`  
   } (the OCPP command payload with some optional fields added to target the simulated charging stations)

- Response:  
   `PDU`: {  
   `status`: 'success' | 'failure',  
   `hashIdsSucceeded`: charging station unique identifier strings array,  
   `hashIdsFailed`: charging station unique identifier strings array (optional),  
   `responsesFailed`: failed responses payload array (optional)  
   }

Examples:

- **Start Transaction**

  - Request:  
    `ProcedureName`: 'startTransaction'  
    `PDU`: {  
    `hashIds`: charging station unique identifier strings array (optional, default: all charging stations),  
    `connectorId`: connector id integer,  
    `idTag`: RFID tag string  
    }

  - Response:  
    `PDU`: {  
    `status`: 'success' | 'failure',  
    `hashIdsSucceeded`: charging station unique identifier strings array,  
    `hashIdsFailed`: charging station unique identifier strings array (optional),  
    `responsesFailed`: failed responses payload array (optional)  
    }

- **Stop Transaction**

  - Request:  
    `ProcedureName`: 'stopTransaction'  
    `PDU`: {  
    `hashIds`: charging station unique identifier strings array (optional, default: all charging stations),  
    `transactionId`: transaction id integer  
    }

  - Response:  
    `PDU`: {  
    `status`: 'success' | 'failure',  
    `hashIdsSucceeded`: charging station unique identifier strings array,  
    `hashIdsFailed`: charging station unique identifier strings array (optional),  
    `responsesFailed`: failed responses payload array (optional)  
    }

- **Status Notification**

  - Request:  
    `ProcedureName`: 'statusNotification'  
    `PDU`: {  
    `hashIds`: charging station unique identifier strings array (optional, default: all charging stations),  
    `connectorId`: connector id integer,  
    `errorCode`: connector error code,  
    `status`: connector status  
    }

  - Response:  
    `PDU`: {  
    `status`: 'success' | 'failure',  
    `hashIdsSucceeded`: charging station unique identifier strings array,  
    `hashIdsFailed`: charging station unique identifier strings array (optional),  
    `responsesFailed`: failed responses payload array (optional)  
    }

- **Heartbeat**

  - Request:  
    `ProcedureName`: 'heartbeat'  
    `PDU`: {  
    `hashIds`: charging station unique identifier strings array (optional, default: all charging stations),  
    }

  - Response:  
    `PDU`: {  
    `status`: 'success' | 'failure',  
    `hashIdsSucceeded`: charging station unique identifier strings array,  
    `hashIdsFailed`: charging station unique identifier strings array (optional),  
    `responsesFailed`: failed responses payload array (optional)  
    }

## Support, Feedback, Contributing

This project is open to feature requests/suggestions, bug reports etc. via [GitHub issues](https://github.com/SAP/e-mobility-charging-stations-simulator/issues). Contribution and feedback are encouraged and always welcome. For more information about how to contribute, the project structure, as well as additional contribution information, see our [Contribution Guidelines](CONTRIBUTING.md).

## Code of Conduct

We as members, contributors, and leaders pledge to make participation in our community a harassment-free experience for everyone. By participating in this project, you agree to abide by its [Code of Conduct](CODE_OF_CONDUCT.md) at all times.

## Licensing

Copyright 2020-2022 SAP SE or an SAP affiliate company and e-mobility-charging-stations-simulator contributors. Please see our [LICENSE](LICENSE) for copyright and license information. Detailed information including third-party components and their licensing/copyright information is available [via the REUSE tool](https://api.reuse.software/info/github.com/SAP/e-mobility-charging-stations-simulator).
