import {
  type AutomaticTransactionGeneratorConfiguration,
  type ChargingStationInfo,
  CurrentType,
  OCPPVersion,
  VendorParametersKey,
} from '../types/index.js'

// Shared literals for class-static members below (TS2729 forbids static
// forward-reference).
const DAY_IN_MS = 86_400_000
const DAY_IN_SECONDS = 86_400

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

  static readonly DEFAULT_ATG_WAIT_TIME_MS = 1000

  static readonly DEFAULT_AUTH_CACHE_CLEANUP_INTERVAL_SECONDS = 300

  /** Implementation-specific upper bound for auth cache entry absolute lifetime (24 hours). Not mandated by OCPP spec. */
  static readonly DEFAULT_AUTH_CACHE_MAX_ABSOLUTE_LIFETIME_MS = DAY_IN_MS

  static readonly DEFAULT_AUTH_CACHE_MAX_ENTRIES = 1000

  static readonly DEFAULT_AUTH_CACHE_RATE_LIMIT_MAX_REQUESTS = 10

  static readonly DEFAULT_AUTH_CACHE_RATE_LIMIT_WINDOW_MS = 60_000
  static readonly DEFAULT_AUTH_CACHE_TTL_SECONDS = 3600

  static readonly DEFAULT_BOOT_NOTIFICATION_INTERVAL_MS = 60_000
  static readonly DEFAULT_CIRCULAR_BUFFER_CAPACITY = 386

  /** Default coherent MeterValues ramp-up duration in milliseconds. Non-positive values disable the ramp. */
  static readonly DEFAULT_COHERENT_RAMP_UP_DURATION_MS = 5000

  /** Default coherent MeterValues voltage-noise symmetric half-width (0.01 = ±1 %). */
  static readonly DEFAULT_COHERENT_VOLTAGE_NOISE_PERCENT = 0.01

  static readonly DEFAULT_EV_CONNECTION_TIMEOUT_SECONDS = 180

  static readonly DEFAULT_EXPONENTIAL_BACKOFF_BASE_DELAY_MS = 100

  static readonly DEFAULT_FLUCTUATION_PERCENT = 5

  static readonly DEFAULT_HASH_ALGORITHM = 'sha384'

  static readonly DEFAULT_HEARTBEAT_INTERVAL_MS = 60_000
  static readonly DEFAULT_LOG_STATISTICS_INTERVAL_SECONDS = 60

  static readonly DEFAULT_MESSAGE_BUFFER_FLUSH_INTERVAL_MS = 60_000
  static readonly DEFAULT_MESSAGE_TIMEOUT_SECONDS = 30

  static readonly DEFAULT_METER_VALUES_INTERVAL_MS = 60_000
  static readonly DEFAULT_PERFORMANCE_DIRECTORY = 'performance'

  static readonly DEFAULT_PERFORMANCE_RECORDS_DB_NAME = 'e-mobility-charging-stations-simulator'
  static readonly DEFAULT_PERFORMANCE_RECORDS_FILENAME = 'performanceRecords.json'

  /**
   * Peak jitter fraction: consumers scale the base delay by a uniform draw in
   * `[0, jitterPercent)`. See `computeExponentialBackOffDelay` (uni-directional
   * positive) and `randomizeDelay` (asymmetric with a probability-zero gap).
   */
  static readonly DEFAULT_RECONNECT_JITTER_PERCENT = 0.2

  /** Default cache TTL for remote authorization results, distinct from `DEFAULT_AUTH_CACHE_TTL_SECONDS` (3600, local cache default). */
  static readonly DEFAULT_REMOTE_AUTH_CACHE_TTL_SECONDS = 300

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
    forceTransactionOnInvalidIdToken: false,
    mainVoltageMeterValues: true,
    meteringPerTransaction: true,
    ocppPersistentConfiguration: true,
    ocppStrictCompliance: true,
    ocppVersion: OCPPVersion.VERSION_16,
    outOfOrderEndMeterValues: false,
    phaseLineToLineVoltageMeterValues: false,
    postTransactionDelay: 0,
    reconnectExponentialDelay: false,
    registrationMaxRetries: -1,
    remoteAuthorization: true,
    resetTime: 30000,
    stationInfoPersistentConfiguration: true,
    stopTransactionsOnStopped: true,
    supervisionUrlOcppConfiguration: false,
    supervisionUrlOcppKey: VendorParametersKey.ConnectionUrl,
    transactionDataMeterValues: false,
    useConnectorId0: true,
  })

  static readonly DEFAULT_TX_UPDATED_INTERVAL_SECONDS = 30

  static readonly DEFAULT_UI_SERVER_HOST = 'localhost'
  static readonly DEFAULT_UI_SERVER_PORT = 8080

  static readonly DEFAULT_WS_HANDSHAKE_TIMEOUT_SECONDS = 30
  static readonly DEFAULT_WS_PING_INTERVAL_SECONDS = 30
  static readonly DEFAULT_WS_RECONNECT_DELAY_SECONDS = 30
  static readonly DEFAULT_WS_RECONNECT_TIMEOUT_OFFSET_MS = 1000

  static readonly EMPTY_FROZEN_OBJECT = Object.freeze({})

  static readonly EMPTY_FUNCTION: () => void = Object.freeze(() => {
    /* This is intentional */
  })

  static readonly ENV_SIMULATOR_COLD_START = 'SIMULATOR_COLD_START'

  static readonly MAX_RANDOM_INTEGER = 281_474_976_710_655 // 2^48 - 1 (randomInt() limit)

  // Node.js setInterval/setTimeout maximum safe delay value (2^31-1 ms ≈ 24.8 days)
  // Values exceeding this limit cause Node.js to reset the delay to 1ms
  static readonly MAX_SETINTERVAL_DELAY_MS = 2_147_483_647
  /** Milliseconds per day; equal to `24 * MS_PER_HOUR`. */
  static readonly MS_PER_DAY = DAY_IN_MS

  /** Milliseconds per hour; conversion factor for `Wh` accrual from `W·ms`. */
  static readonly MS_PER_HOUR = 3_600_000

  static readonly PERFORMANCE_RECORDS_TABLE = 'performance_records'

  /** Seconds per day; used for day-normalized time arithmetic. */
  static readonly SECONDS_PER_DAY = DAY_IN_SECONDS

  /** State of Charge maximum percentage (upper bound for SoC measurand emission). */
  static readonly SOC_MAXIMUM_PERCENT = 100

  static readonly STOP_CHARGING_STATIONS_TIMEOUT_MS = 60_000
  static readonly STOP_MESSAGE_SEQUENCE_TIMEOUT_MS = 30_000
  /** Divider between base units (A) and centi units (cA). */
  static readonly UNIT_DIVIDER_CENTI = 100

  /** Divider between base units (A) and deci units (dA). */
  static readonly UNIT_DIVIDER_DECI = 10

  /** Divider between base units (W, Wh, A) and kilo/milli units (kW, kWh, mA). */
  static readonly UNIT_DIVIDER_KILO = 1000
}
