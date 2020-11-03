export default class Constants {
  static REST_RESPONSE_SUCCESS = { status: 'Success' };

  static CONN_STATUS_AVAILABLE = 'Available';
  static CONN_STATUS_OCCUPIED = 'Occupied';

  static STATS_GROUP_BY_CONSUMPTION = 'C';
  static STATS_GROUP_BY_USAGE = 'U';

  // Statuses
  static ENTITY_SITE = 'Site';
  static ENTITY_SITES = 'Sites';
  static ENTITY_SITE_AREA = 'SiteArea';
  static ENTITY_SITE_AREAS = 'SiteAreas';
  static ENTITY_COMPANY = 'Company';
  static ENTITY_COMPANIES = 'Companies';
  static ENTITY_CHARGING_STATION = 'ChargingStation';
  static ENTITY_CHARGING_STATIONS = 'ChargingStations';
  static ENTITY_TENANT = 'Tenant';
  static ENTITY_TENANTS = 'Tenants';
  static ENTITY_TRANSACTION = 'Transaction';
  static ENTITY_TRANSACTIONS = 'Transactions';
  static ENTITY_TRANSACTION_METER_VALUES = 'MeterValues';
  static ENTITY_TRANSACTION_STOP = 'Stop';
  static ENTITY_USER = 'User';
  static ENTITY_USERS = 'Users';
  static ENTITY_VEHICLE_MANUFACTURER = 'VehicleManufacturer';
  static ENTITY_VEHICLE_MANUFACTURERS = 'VehicleManufacturers';
  static ENTITY_VEHICLES = 'Vehicles';
  static ENTITY_VEHICLE = 'Vehicle';
  static ENTITY_LOGGINGS = 'Loggings';
  static ENTITY_LOGGING = 'Logging';
  static ENTITY_PRICING = 'Pricing';

  static NOTIFICATION_TYPE_CHARGING_STATION_CONFIGURATION = 'Configuration';

  static ACTION_READ = 'Read';
  static ACTION_CREATE = 'Create';
  static ACTION_UPDATE = 'Update';
  static ACTION_DELETE = 'Delete';

  static NO_LIMIT = 0;

  static CENTRAL_SERVER = 'Central Server';

  static WITH_CONNECTORS = true;
  static WITHOUT_CONNECTORS = false;

  static WITH_CHARGING_STATIONS = true;
  static WITHOUT_CHARGING_STATIONS = false;
  static WITH_SITE = true;
  static WITHOUT_SITE = false;

  static VEHICLE_TYPE_CAR = 'C';

  // Statuses
  static USER_STATUS_PENDING = 'P';
  static USER_STATUS_ACTIVE = 'A';
  static USER_STATUS_DELETED = 'D';
  static USER_STATUS_INACTIVE = 'I';
  static USER_STATUS_BLOCKED = 'B';
  static USER_STATUS_LOCKED = 'L';

  // Roles
  static ROLE_SUPER_ADMIN = 'S';
  static ROLE_ADMIN = 'A';
  static ROLE_BASIC = 'B';
  static ROLE_DEMO = 'D';
  static ACTION_LOGOUT = 'Logout';
  static ACTION_LIST = 'List';
  static ACTION_RESET = 'Reset';
  static ACTION_AUTHORIZE = 'Authorize';
  static ACTION_CLEAR_CACHE = 'ClearCache';
  static ACTION_STOP_TRANSACTION = 'StopTransaction';
  static ACTION_START_TRANSACTION = 'StartTransaction';
  static ACTION_REFUND_TRANSACTION = 'RefundTransaction';
  static ACTION_UNLOCK_CONNECTOR = 'UnlockConnector';
  static ACTION_GET_CONFIGURATION = 'GetConfiguration';

  // Password constants
  static PWD_MIN_LENGTH = 15;
  static PWD_MAX_LENGTH = 20;
  static PWD_UPPERCASE_MIN_COUNT = 1;
  static PWD_LOWERCASE_MIN_COUNT = 1;
  static PWD_NUMBER_MIN_COUNT = 1;
  static PWD_SPECIAL_MIN_COUNT = 1;

  static PWD_UPPERCASE_RE = /([A-Z])/g;
  static PWD_LOWERCASE_RE = /([a-z])/g;
  static PWD_NUMBER_RE = /([\d])/g;
  static PWD_SPECIAL_CHAR_RE = /([!#$%^&*.?-])/g;

  static DEFAULT_LOCALE = 'en_US';

  static ANONYMIZED_VALUE = '####';

  static DEFAULT_DB_LIMIT = 100;

  static METER_VALUE_CTX_SAMPLE_PERIODIC = 'Sample.Periodic';
  static METER_VALUE_CTX_SAMPLE_CLOCK = 'Sample.Clock';

  static WS_UNSUPPORTED_DATA = 1007;

  static OCPP_RESPONSE_ACCEPTED = { status: 'Accepted' };
  static OCPP_RESPONSE_REJECTED = { status: 'Rejected' };
  static OCPP_RESPONSE_REBOOT_REQUIRED = { status: 'RebootRequired' };
  static OCPP_SOCKET_TIMEOUT = 60000; // 60 sec
  static OCPP_JSON_CALL_MESSAGE = 2; // Caller to callee
  static OCPP_JSON_CALL_RESULT_MESSAGE = 3; // Callee to caller
  static OCPP_JSON_CALL_ERROR_MESSAGE = 4; // Callee to caller
  // Requested Action is not known by receiver
  static OCPP_ERROR_NOT_IMPLEMENTED = 'NotImplemented';
  // Requested Action is recognized but not supported by the receiver
  static OCPP_ERROR_NOT_SUPPORTED = 'NotSupported';
  // An internal error occurred and the receiver was not able to process the requested Action successfully
  static OCPP_ERROR_INTERNAL_ERROR = 'InternalError';
  // Payload for Action is incomplete
  static OCPP_ERROR_PROTOCOL_ERROR = 'ProtocolError';
  // During the processing of Action a security issue occurred preventing receiver from completing the Action successfully
  static OCPP_ERROR_SECURITY_ERROR = 'SecurityError';
  // Payload for Action is syntactically incorrect or not conform the PDU structure for Action
  static OCPP_ERROR_FORMATION_VIOLATION = 'FormationViolation';
  // Payload is syntactically correct but at least one field contains an invalid value
  static OCPP_ERROR_PROPERTY_RAINT_VIOLATION = 'PropertyraintViolation';
  // Payload for Action is syntactically correct but at least one of the fields violates occurrence raints
  static OCPP_ERROR_OCCURENCE_RAINT_VIOLATION = 'OccurenceraintViolation';
  // Payload for Action is syntactically correct but at least one of the fields violates data type raints (e.g. “somestring” = 12)
  static OCPP_ERROR_TYPERAINT_VIOLATION = 'TyperaintViolation';
  // Any other error not covered by the previous ones
  static OCPP_ERROR_GENERIC_ERROR = 'GenericError';

  static OCPP_PROTOCOL_JSON = 'json';
  static OCPP_PROTOCOL_SOAP = 'soap';
  static OCPP_VERSION_12 = '1.2';
  static OCPP_VERSION_15 = '1.5';
  static OCPP_VERSION_16 = '1.6';
  static OCPP_VERSION_20 = '2.0';

  static STATUS_NOTIFICATION_TIMEOUT = 500;
  static START_TRANSACTION_TIMEOUT = 500;

  static CHARGING_STATION_DEFAULT_RESET_TIME = 60000; // Ms
  static CHARGING_STATION_ATG_WAIT_TIME = 2000; // Ms
}
