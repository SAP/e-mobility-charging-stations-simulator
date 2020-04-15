module.exports = {
  REST_RESPONSE_SUCCESS: {status: 'Success'},

  CONN_STATUS_AVAILABLE: 'Available',
  CONN_STATUS_OCCUPIED: 'Occupied',

  STATS_GROUP_BY_CONSUMPTION: 'C',
  STATS_GROUP_BY_USAGE: 'U',

  // Statuses
  ENTITY_SITE: 'Site',
  ENTITY_SITES: 'Sites',
  ENTITY_SITE_AREA: 'SiteArea',
  ENTITY_SITE_AREAS: 'SiteAreas',
  ENTITY_COMPANY: 'Company',
  ENTITY_COMPANIES: 'Companies',
  ENTITY_CHARGING_STATION: 'ChargingStation',
  ENTITY_CHARGING_STATIONS: 'ChargingStations',
  ENTITY_TENANT: 'Tenant',
  ENTITY_TENANTS: 'Tenants',
  ENTITY_TRANSACTION: 'Transaction',
  ENTITY_TRANSACTIONS: 'Transactions',
  ENTITY_TRANSACTION_METER_VALUES: 'MeterValues',
  ENTITY_TRANSACTION_STOP: 'Stop',
  ENTITY_USER: 'User',
  ENTITY_USERS: 'Users',
  ENTITY_VEHICLE_MANUFACTURER: 'VehicleManufacturer',
  ENTITY_VEHICLE_MANUFACTURERS: 'VehicleManufacturers',
  ENTITY_VEHICLES: 'Vehicles',
  ENTITY_VEHICLE: 'Vehicle',
  ENTITY_LOGGINGS: 'Loggings',
  ENTITY_LOGGING: 'Logging',
  ENTITY_PRICING: 'Pricing',

  NOTIF_TYPE_CHARGING_STATION_CONFIGURATION: 'Configuration',

  ACTION_READ: 'Read',
  ACTION_CREATE: 'Create',
  ACTION_UPDATE: 'Update',
  ACTION_DELETE: 'Delete',

  NO_LIMIT: 0,

  CENTRAL_SERVER: 'Central Server',

  WITH_CONNECTORS: true,
  WITHOUT_CONNECTORS: false,

  WITH_CHARGING_STATIONS: true,
  WITHOUT_CHARGING_STATIONS: false,
  WITH_SITE: true,
  WITHOUT_SITE: false,

  VEHICLE_TYPE_CAR: 'C',

  // Statuses
  USER_STATUS_PENDING: 'P',
  USER_STATUS_ACTIVE: 'A',
  USER_STATUS_DELETED: 'D',
  USER_STATUS_INACTIVE: 'I',
  USER_STATUS_BLOCKED: 'B',
  USER_STATUS_LOCKED: 'L',

  // Roles
  ROLE_SUPER_ADMIN: 'S',
  ROLE_ADMIN: 'A',
  ROLE_BASIC: 'B',
  ROLE_DEMO: 'D',
  ACTION_LOGOUT: 'Logout',
  ACTION_LIST: 'List',
  ACTION_RESET: 'Reset',
  ACTION_AUTHORIZE: 'Authorize',
  ACTION_CLEAR_CACHE: 'ClearCache',
  ACTION_STOP_TRANSACTION: 'StopTransaction',
  ACTION_START_TRANSACTION: 'StartTransaction',
  ACTION_REFUND_TRANSACTION: 'RefundTransaction',
  ACTION_UNLOCK_CONNECTOR: 'UnlockConnector',
  ACTION_GET_CONFIGURATION: 'GetConfiguration',

  // Password constants
  PWD_MIN_LENGTH: 15,
  PWD_MAX_LENGTH: 20,
  PWD_UPPERCASE_MIN_COUNT: 1,
  PWD_LOWERCASE_MIN_COUNT: 1,
  PWD_NUMBER_MIN_COUNT: 1,
  PWD_SPECIAL_MIN_COUNT: 1,

  PWD_UPPERCASE_RE: /([A-Z])/g,
  PWD_LOWERCASE_RE: /([a-z])/g,
  PWD_NUMBER_RE: /([\d])/g,
  PWD_SPECIAL_CHAR_RE: /([!#$%^&*.?-])/g,

  DEFAULT_LOCALE: 'en_US',

  ANONYMIZED_VALUE: '####',

  DEFAULT_DB_LIMIT: 100,

  METER_VALUE_CTX_SAMPLE_PERIODIC: 'Sample.Periodic',
  METER_VALUE_CTX_SAMPLE_CLOCK: 'Sample.Clock',

  WS_UNSUPPORTED_DATA: 1007,

  OCPP_SOCKET_TIMEOUT: 60000, // 60 sec
  OCPP_JSON_CALL_MESSAGE: 2, // Client-to-Server
  OCPP_JSON_CALL_RESULT_MESSAGE: 3, // Server-to-Client
  OCPP_JSON_CALL_ERROR_MESSAGE: 4, // Server-to-Client
  // Requested Action is not known by receiver
  OCPP_ERROR_NOT_IMPLEMENTED: 'NotImplemented',
  // Requested Action is recognized but not supported by the receiver
  OCPP_ERROR_NOT_SUPPORTED: 'NotSupported',
  // An internal error occurred and the receiver was not able to process the requested Action successfully
  OCPP_ERROR_INTERNAL_ERROR: 'InternalError',
  // Payload for Action is incomplete
  OCPP_ERROR_PROTOCOL_ERROR: 'ProtocolError',
  // During the processing of Action a security issue occurred preventing receiver from completing the Action successfully
  OCPP_ERROR_SECURITY_ERROR: 'SecurityError',
  // Payload for Action is syntactically incorrect or not conform the PDU structure for Action
  OCPP_ERROR_FORMATION_VIOLATION: 'FormationViolation',
  // Payload is syntactically correct but at least one field contains an invalid value
  OCPP_ERROR_PROPERTY_RAINT_VIOLATION: 'PropertyraintViolation',
  // Payload for Action is syntactically correct but at least one of the fields violates occurence raints
  OCPP_ERROR_OCCURENCE_RAINT_VIOLATION: 'OccurenceraintViolation',
  // Payload for Action is syntactically correct but at least one of the fields violates data type raints (e.g. “somestring”: 12)
  OCPP_ERROR_TYPERAINT_VIOLATION: 'TyperaintViolation',
  // Any other error not covered by the previous ones
  OCPP_ERROR_GENERIC_ERROR: 'GenericError',

  OCPP_PROTOCOL_JSON: 'json',
  OCPP_PROTOCOL_SOAP: 'soap',
  OCPP_VERSION_12: '1.2',
  OCPP_VERSION_15: '1.5',
  OCPP_VERSION_16: '1.6',
  OCPP_VERSION_20: '2.0',
};
