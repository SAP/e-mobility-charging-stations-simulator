import {
  type AutomaticTransactionGeneratorConfiguration,
  type ChargingStationInfo,
  CurrentType,
  type IncomingRequestCommand,
  OCPPVersion,
  type RequestCommand,
  VendorParametersKey,
} from '../types/index.js'

// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class Constants {
  static readonly DEFAULT_ATG_CONFIGURATION: Readonly<AutomaticTransactionGeneratorConfiguration> =
    Object.freeze({
      enable: false,
      maxDelayBetweenTwoTransactions: 30,
      maxDuration: 120,
      minDelayBetweenTwoTransactions: 15,
      minDuration: 60,
      probabilityOfStart: 1,
      stopAbsoluteDuration: false,
      stopAfterHours: 0.25,
    })

  static readonly DEFAULT_ATG_WAIT_TIME = 1000 // Ms

  static readonly DEFAULT_BOOT_NOTIFICATION_INTERVAL = 60000 // Ms

  static readonly DEFAULT_CIRCULAR_BUFFER_CAPACITY = 386
  static readonly DEFAULT_CONNECTION_TIMEOUT = 30 // Seconds
  static readonly DEFAULT_EV_CONNECTION_TIMEOUT = 180 // Seconds

  static readonly DEFAULT_FLUCTUATION_PERCENT = 5
  static readonly DEFAULT_HASH_ALGORITHM = 'sha384'

  static readonly DEFAULT_HEARTBEAT_INTERVAL = 60000 // Ms

  static readonly DEFAULT_IDTAG = '00000000'

  static readonly DEFAULT_LOG_STATISTICS_INTERVAL = 60 // Seconds

  static readonly DEFAULT_MESSAGE_BUFFER_FLUSH_INTERVAL = 60000 // Ms

  static readonly DEFAULT_METER_VALUES_INTERVAL = 60000 // Ms

  static readonly DEFAULT_PERFORMANCE_DIRECTORY = 'performance'
  static readonly DEFAULT_PERFORMANCE_RECORDS_DB_NAME = 'e-mobility-charging-stations-simulator'
  static readonly DEFAULT_PERFORMANCE_RECORDS_FILENAME = 'performanceRecords.json'

  static readonly DEFAULT_STATION_INFO: Readonly<Partial<ChargingStationInfo>> = Object.freeze({
    automaticTransactionGeneratorPersistentConfiguration: true,
    autoReconnectMaxRetries: -1,
    autoStart: true,
    beginEndMeterValues: false,
    currentOutType: CurrentType.AC,
    customValueLimitationMeterValues: true,
    enableStatistics: false,
    firmwareUpgrade: {
      reset: true,
      versionUpgrade: {
        step: 1,
      },
    },
    // See https://semver.org/#is-there-a-suggested-regular-expression-regex-to-check-a-semver-string
    firmwareVersionPattern:
      '^(0|[1-9]\\d*)\\.(0|[1-9]\\d*)\\.(0|[1-9]\\d*)(?:-((?:0|[1-9]\\d*|\\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\\.(?:0|[1-9]\\d*|\\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\\+([0-9a-zA-Z-]+(?:\\.[0-9a-zA-Z-]+)*))?$',
    mainVoltageMeterValues: true,
    meteringPerTransaction: true,
    ocppPersistentConfiguration: true,
    ocppStrictCompliance: true,
    ocppVersion: OCPPVersion.VERSION_16,
    outOfOrderEndMeterValues: false,
    phaseLineToLineVoltageMeterValues: false,
    reconnectExponentialDelay: false,
    registrationMaxRetries: -1,
    remoteAuthorization: true,
    resetTime: 30000, // Ms
    stationInfoPersistentConfiguration: true,
    stopTransactionsOnStopped: true,
    supervisionUrlOcppConfiguration: false,
    supervisionUrlOcppKey: VendorParametersKey.ConnectionUrl,
    transactionDataMeterValues: false,
    useConnectorId0: true,
  })

  static readonly DEFAULT_TX_UPDATED_INTERVAL = 30 // Seconds

  static readonly DEFAULT_UI_SERVER_HOST = 'localhost'
  static readonly DEFAULT_UI_SERVER_PORT = 8080

  static readonly DEFAULT_WEBSOCKET_PING_INTERVAL = 30 // Seconds

  static readonly EMPTY_FROZEN_OBJECT = Object.freeze({})

  static readonly EMPTY_FUNCTION: () => void = Object.freeze(() => {
    /* This is intentional */
  })

  static readonly MAX_RANDOM_INTEGER = 281474976710655 // 2^48 - 1 (randomInit() limit)

  static readonly OCPP_VALUE_ABSOLUTE_MAX_LENGTH = 2500

  static readonly PERFORMANCE_RECORDS_TABLE = 'performance_records'

  static readonly STOP_CHARGING_STATIONS_TIMEOUT = 60000 // Ms

  static readonly UNKNOWN_OCPP_COMMAND = 'unknown OCPP command' as
    | IncomingRequestCommand
    | RequestCommand

  private constructor () {
    // This is intentional
  }
}
