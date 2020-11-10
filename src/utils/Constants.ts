export default class Constants {
  static readonly ENTITY_CHARGING_STATION = 'ChargingStation';
  static readonly ENTITY_AUTOMATIC_TRANSACTION_GENERATOR = 'AutomaticTransactionGenerator';

  static readonly WS_UNSUPPORTED_DATA = 1007;

  static readonly OCPP_RESPONSE_ACCEPTED = Object.freeze({ status: 'Accepted' });
  static readonly OCPP_RESPONSE_REJECTED = Object.freeze({ status: 'Rejected' });
  static readonly OCPP_RESPONSE_REBOOT_REQUIRED = Object.freeze({ status: 'RebootRequired' });
  static readonly OCPP_SOCKET_TIMEOUT = 60000; // 60 sec
  static readonly OCPP_JSON_CALL_MESSAGE = 2; // Caller to callee
  static readonly OCPP_JSON_CALL_RESULT_MESSAGE = 3; // Callee to caller
  static readonly OCPP_JSON_CALL_ERROR_MESSAGE = 4; // Callee to caller
  // Requested Action is not known by receiver
  static readonly OCPP_ERROR_NOT_IMPLEMENTED = 'NotImplemented';
  // Requested Action is recognized but not supported by the receiver
  static readonly OCPP_ERROR_NOT_SUPPORTED = 'NotSupported';
  // An internal error occurred and the receiver was not able to process the requested Action successfully
  static readonly OCPP_ERROR_INTERNAL_ERROR = 'InternalError';
  // Payload for Action is incomplete
  static readonly OCPP_ERROR_PROTOCOL_ERROR = 'ProtocolError';
  // During the processing of Action a security issue occurred preventing receiver from completing the Action successfully
  static readonly OCPP_ERROR_SECURITY_ERROR = 'SecurityError';
  // Payload for Action is syntactically incorrect or not conform the PDU structure for Action
  static readonly OCPP_ERROR_FORMATION_VIOLATION = 'FormationViolation';
  // Payload is syntactically correct but at least one field contains an invalid value
  static readonly OCPP_ERROR_PROPERTY_RAINT_VIOLATION = 'PropertyraintViolation';
  // Payload for Action is syntactically correct but at least one of the fields violates occurrence raints
  static readonly OCPP_ERROR_OCCURENCE_RAINT_VIOLATION = 'OccurenceraintViolation';
  // Payload for Action is syntactically correct but at least one of the fields violates data type raints (e.g. “somestring” = 12)
  static readonly OCPP_ERROR_TYPERAINT_VIOLATION = 'TyperaintViolation';
  // Any other error not covered by the previous ones
  static readonly OCPP_ERROR_GENERIC_ERROR = 'GenericError';

  static readonly OCPP_PROTOCOL_JSON = 'json';
  static readonly OCPP_PROTOCOL_SOAP = 'soap';
  static readonly OCPP_VERSION_12 = '1.2';
  static readonly OCPP_VERSION_15 = '1.5';
  static readonly OCPP_VERSION_16 = '1.6';
  static readonly OCPP_VERSION_20 = '2.0';

  static readonly CHARGING_STATION_DEFAULT_RESET_TIME = 60000; // Ms
  static readonly CHARGING_STATION_ATG_WAIT_TIME = 2000; // Ms
}
