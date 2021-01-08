export enum ErrorType {
  // Requested Action is not known by receiver
  NOT_IMPLEMENTED = 'NotImplemented',
  // Requested Action is recognized but not supported by the receiver
  NOT_SUPPORTED = 'NotSupported',
  // An internal error occurred and the receiver was not able to process the requested Action successfully
  INTERNAL_ERROR = 'InternalError',
  // Payload for Action is incomplete
  PROTOCOL_ERROR = 'ProtocolError',
  // During the processing of Action a security issue occurred preventing receiver from completing the Action successfully
  SECURITY_ERROR = 'SecurityError',
  // Payload for Action is syntactically incorrect or not conform the PDU structure for Action
  FORMATION_VIOLATION = 'FormationViolation',
  // Payload is syntactically correct but at least one field contains an invalid value
  PROPERTY_RAINT_VIOLATION = 'PropertyraintViolation',
  // Payload for Action is syntactically correct but at least one of the fields violates occurrence raints
  OCCURRENCE_RAINT_VIOLATION = 'OccurrenceraintViolation',
  // Payload for Action is syntactically correct but at least one of the fields violates data type raints (e.g. "somestring" = 12)
  TYPERAINT_VIOLATION = 'TyperaintViolation',
  // Any other error not covered by the previous ones
  GENERIC_ERROR = 'GenericError',
}
