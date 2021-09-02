# charging-stations-simulator

## Summary

Simple [node.js](https://nodejs.org/) program to simulate a set of charging stations based on the OCPP-J 1.6 protocol.

## Configuration syntax

All configuration files are in the JSON standard format.  

The program's global configuration parameters must be within the src/assets/config.json file. A configuration template file is available at [src/assets/config-template.json](src/assets/config-template.json).

All charging station templates are in the directory [src/assets/station-templates](src/assets/station-templates).

A list of RFID tags must be defined for the automatic transaction generator with the default location and name src/assets/authorization-tags.json. A template file is available at [src/assets/authorization-tags-template.json](src/assets/authorization-tags-template.json).

### Global configuration 

**src/assets/config.json**:

Key | Value(s) | Default Value | Value type | Description 
--- | -------| --------------| ---------- | ------------
supervisionURLs | | [] | string[] |  array of connection URIs to OCPP-J servers
distributeStationsToTenantsEqually | true/false | true | boolean | distribute charging stations uniformly to the OCPP-J servers
workerProcess | workerSet/staticPool/dynamicPool | workerSet | string | worker threads process type
workerStartDelay | | 500 | integer | milliseconds to wait at charging station worker threads startup
workerPoolMinSize | | 4 | integer | worker threads pool minimum number of threads
workerPoolMaxSize | | 16 | integer | worker threads pool maximum number of threads
workerPoolStrategy | ROUND_ROBIN/LESS_RECENTLY_USED/... | [poolifier](https://github.com/poolifier/poolifier) default: ROUND_ROBBIN | string | worker threads pool [poolifier](https://github.com/poolifier/poolifier) worker choice strategy
chargingStationsPerWorker | | 1 | integer | number of charging stations per worker threads for the `workerSet` process type
logStatisticsInterval | | 60 | integer | seconds between charging stations statistics output in the logs 
logConsole | true/false | false | boolean | output logs on the console 
logFormat | | simple | string | winston log format
logRotate | true/false | true | boolean | enable daily log files rotation
logMaxFiles | | 7 | integer | maximum number of log files to keep
logLevel | emerg/alert/crit/error/warning/notice/info/debug | info | string | winston logging level
logFile | | combined.log | string | log file relative path
logErrorFile | | error.log | string | error log file relative path 
performanceStorage | | { "enabled": false, "type": "jsonfile", "file:///performanceMeasurements.json" } | { enabled: string; type: string; URI: string; } where type can be 'jsonfile', 'mysql', 'mariadb', 'sqlite' or 'mongodb' | performance storage configuration section
stationTemplateURLs | | {}[] | { file: string; numberOfStations: number; }[] | array of charging station templates URIs configuration section (template file name and number of stations)

#### Worker process model: 

- **workerSet**:
  Worker set executing each a static number (chargingStationsPerWorker) of simulated charging stations from the total

- **staticPool**:
  Statically sized worker pool executing a static total number of simulated charging stations    

- **dynamicPool**:
  Dynamically sized worker pool executing a static total number of simulated charging stations 

### Charging station template

Key | Value(s) | Default Value | Value type | Description 
--- | -------| --------------| ---------- | ------------
supervisionURL | | '' | string | connection URI to OCPP-J server
supervisionUser | | '' | string | basic HTTP authentication user to OCPP-J server
supervisionPassword | | '' | string | basic HTTP authentication password to OCPP-J server
ocppVersion | 1.6 | 1.6 | string | OCPP version 
ocppProtocol | json | json | string | OCPP protocol
authorizationFile | | '' | string | RFID tags list file relative to src/assets path
baseName | | '' | string | base name to build charging stations name
nameSuffix | | '' | string | name suffix to build charging stations name
fixedName | true/false | false | boolean | use the baseName as the charging stations unique name
chargePointModel | | '' | string | charging stations model
chargePointVendor | | '' | string | charging stations vendor
chargeBoxSerialNumberPrefix | | '' | string | charging stations serial number prefix
firmwareVersion | | '' | string | charging stations firmware version
power | | | float\|float[] | charging stations maximum power value(s)
powerSharedByConnectors | true/false | false | boolean | charging stations power shared by its connectors
powerUnit | W/kW | W | string | charging stations power unit
currentOutType | AC/DC | AC | string | charging stations current out type
voltageOut | | AC:230/DC:400 | integer | charging stations voltage out
numberOfPhases | 0/1/3 | AC:3/DC:0 | integer | charging stations number of phase(s) 
numberOfConnectors | | | integer\|integer[] | charging stations number of connector(s)
useConnectorId0 | true/false | true | boolean | use connector id 0 definition from the template
randomConnectors | true/false | false | boolean | randomize runtime connector id affectation from the connector id definition in template
resetTime | | 60 | integer | seconds to wait before the charging stations come back at reset
autoRegister | true/false | false | boolean | set the charging station as registered at boot notification for testing purpose
autoReconnectMaxRetries | | -1 (unlimited) | integer | connection retries to the OCPP-J server
reconnectExponentialDelay | true/false | false | boolean | connection delay retry to the OCPP-J server
registrationMaxRetries | | -1 (unlimited) | integer | charging stations boot notification retries
enableStatistics | true/false | true | boolean | enable charging stations statistics
mayAuthorizeAtRemoteStart | true/false | true | boolean | always send authorize at remote start transaction when AuthorizeRemoteTxRequests is enabled
beginEndMeterValues | true/false | false | boolean | enable Transaction.{Begin,End} MeterValues
outOfOrderEndMeterValues | true/false | false | boolean | send Transaction.End MeterValues out of order
meteringPerTransaction | true/false | true | boolean | enable metering history on a per transaction basis
transactionDataMeterValues | true/false | false | boolean | enable transaction data MeterValues at stop transaction
mainVoltageMeterValues | true/false | true | boolean | include charging station main voltage MeterValues on three phased charging stations
phaseLineToLineVoltageMeterValues | true/false | true | boolean | include charging station line to line voltage MeterValues on three phased charging stations
Configuration | | | ChargingStationConfiguration | charging stations OCPP parameters configuration section
AutomaticTransactionGenerator | | | AutomaticTransactionGenerator | charging stations ATG configuration section
Connectors | | | Connectors | charging stations connectors configuration section

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

## Start

To start the program, run: `npm start`.

## Docker

In the [docker](./docker) folder:

```bash
make
```

Or without the optional git submodules:

```bash
make SUBMODULES_INIT=false
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
- :x: DiagnosticsStatusNotification
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
- :white_check_mark: GetCompositeSchedule
- :white_check_mark: SetChargingProfile

#### Remote Trigger Profile

- :x: TriggerMessage

## OCPP-J standard parameters supported

All kind of OCPP parameters are supported in a charging station template. The list here mention the standard ones also handled automatically in the simulator. 

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

- *none*

#### Local Auth List Management Profile

- :white_check_mark: LocalAuthListEnabled (type: boolean) (units: -)
- :x: LocalAuthListMaxLength (type: integer) (units: -)
- :x: SendLocalListMaxLength (type: integer) (units: -)

#### Reservation Profile

- *none*

#### Smart Charging Profile

- :x: ChargeProfileMaxStackLevel (type: integer) (units: -)
- :x: ChargingScheduleAllowedChargingRateUnit (type: CSL) (units: -)
- :x: ChargingScheduleMaxPeriods (type: integer) (units: -)
- :x: MaxChargingProfilesInstalled (type: integer) (units: -)

#### Remote Trigger Profile

- *none*

## License

This file and all other files in this repository are licensed under the Apache Software License, v.2 and copyrighted under the copyright in [NOTICE](NOTICE) file, except as noted otherwise in the [LICENSE](LICENSE) file or the code source file header.

Please note that Docker images can contain other software which may be licensed under different licenses. This LICENSE and NOTICE files are also included in the Docker image. For any usage of built Docker images please make sure to check the licenses of the artifacts contained in the images.
