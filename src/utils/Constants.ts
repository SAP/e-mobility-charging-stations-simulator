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
  // See https://semver.org/#is-there-a-suggested-regular-expression-regex-to-check-a-semver-string
  private static readonly SEMVER_PATTERN =
    '^(0|[1-9]\\d*)\\.(0|[1-9]\\d*)\\.(0|[1-9]\\d*)(?:-((?:0|[1-9]\\d*|\\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\\.(?:0|[1-9]\\d*|\\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\\+([0-9a-zA-Z-]+(?:\\.[0-9a-zA-Z-]+)*))?$'

  private static readonly DEFAULT_CHARGING_STATION_RESET_TIME = 30000 // Ms

  static readonly DEFAULT_STATION_INFO: Partial<ChargingStationInfo> = Object.freeze({
    enableStatistics: false,
    autoStart: true,
    remoteAuthorization: true,
    currentOutType: CurrentType.AC,
    mainVoltageMeterValues: true,
    phaseLineToLineVoltageMeterValues: false,
    customValueLimitationMeterValues: true,
    ocppStrictCompliance: true,
    outOfOrderEndMeterValues: false,
    beginEndMeterValues: false,
    meteringPerTransaction: true,
    transactionDataMeterValues: false,
    supervisionUrlOcppConfiguration: false,
    supervisionUrlOcppKey: VendorParametersKey.ConnectionUrl,
    useConnectorId0: true,
    ocppVersion: OCPPVersion.VERSION_16,
    firmwareVersionPattern: Constants.SEMVER_PATTERN,
    firmwareUpgrade: {
      versionUpgrade: {
        step: 1,
      },
      reset: true,
    },
    ocppPersistentConfiguration: true,
    stationInfoPersistentConfiguration: true,
    automaticTransactionGeneratorPersistentConfiguration: true,
    resetTime: Constants.DEFAULT_CHARGING_STATION_RESET_TIME,
    autoReconnectMaxRetries: -1,
    registrationMaxRetries: -1,
    reconnectExponentialDelay: false,
    stopTransactionsOnStopped: true,
  })

  static readonly DEFAULT_BOOT_NOTIFICATION_INTERVAL = 60000 // Ms
  static readonly DEFAULT_HEARTBEAT_INTERVAL = 60000 // Ms
  static readonly DEFAULT_METER_VALUES_INTERVAL = 60000 // Ms

  static readonly DEFAULT_ATG_WAIT_TIME = 1000 // Ms
  static readonly DEFAULT_ATG_CONFIGURATION: AutomaticTransactionGeneratorConfiguration =
    Object.freeze({
      enable: false,
      minDuration: 60,
      maxDuration: 120,
      minDelayBetweenTwoTransactions: 15,
      maxDelayBetweenTwoTransactions: 30,
      probabilityOfStart: 1,
      stopAfterHours: 0.25,
      stopAbsoluteDuration: false,
    })

  static readonly DEFAULT_CIRCULAR_BUFFER_CAPACITY = 386

  static readonly DEFAULT_HASH_ALGORITHM = 'sha384'

  static readonly DEFAULT_IDTAG = '00000000'

  static readonly DEFAULT_CONNECTION_TIMEOUT = 30

  static readonly DEFAULT_LOG_STATISTICS_INTERVAL = 60 // Seconds

  static readonly DEFAULT_FLUCTUATION_PERCENT = 5

  static readonly DEFAULT_PERFORMANCE_DIRECTORY = 'performance'
  static readonly DEFAULT_PERFORMANCE_RECORDS_FILENAME = 'performanceRecords.json'
  static readonly DEFAULT_PERFORMANCE_RECORDS_DB_NAME = 'e-mobility-charging-stations-simulator'
  static readonly PERFORMANCE_RECORDS_TABLE = 'performance_records'

  static readonly DEFAULT_UI_SERVER_HOST = 'localhost'
  static readonly DEFAULT_UI_SERVER_PORT = 8080

  static readonly UNKNOWN_OCPP_COMMAND = 'unknown OCPP command' as
    | RequestCommand
    | IncomingRequestCommand

  static readonly MAX_RANDOM_INTEGER = 281474976710655

  static readonly STOP_CHARGING_STATIONS_TIMEOUT = 60000 // Ms

  static readonly EMPTY_FROZEN_OBJECT = Object.freeze({})
  static readonly EMPTY_FUNCTION = Object.freeze(() => {
    /* This is intentional */
  })

  static readonly DEFAULT_MESSAGE_BUFFER_FLUSH_INTERVAL = 60000 // Ms

  private constructor () {
    // This is intentional
  }
}
