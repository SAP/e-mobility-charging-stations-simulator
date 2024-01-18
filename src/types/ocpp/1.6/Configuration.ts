export enum OCPP16SupportedFeatureProfiles {
  Core = 'Core',
  FirmwareManagement = 'FirmwareManagement',
  LocalAuthListManagement = 'LocalAuthListManagement',
  Reservation = 'Reservation',
  SmartCharging = 'SmartCharging',
  RemoteTrigger = 'RemoteTrigger'
}

export enum OCPP16StandardParametersKey {
  AllowOfflineTxForUnknownId = 'AllowOfflineTxForUnknownId',
  AuthorizationCacheEnabled = 'AuthorizationCacheEnabled',
  AuthorizeRemoteTxRequests = 'AuthorizeRemoteTxRequests',
  BlinkRepeat = 'BlinkRepeat',
  ClockAlignedDataInterval = 'ClockAlignedDataInterval',
  ConnectionTimeOut = 'ConnectionTimeOut',
  GetConfigurationMaxKeys = 'GetConfigurationMaxKeys',
  HeartbeatInterval = 'HeartbeatInterval',
  HeartBeatInterval = 'HeartBeatInterval',
  LightIntensity = 'LightIntensity',
  LocalAuthorizeOffline = 'LocalAuthorizeOffline',
  LocalPreAuthorize = 'LocalPreAuthorize',
  MaxEnergyOnInvalidId = 'MaxEnergyOnInvalidId',
  MeterValuesAlignedData = 'MeterValuesAlignedData',
  MeterValuesAlignedDataMaxLength = 'MeterValuesAlignedDataMaxLength',
  MeterValuesSampledData = 'MeterValuesSampledData',
  MeterValuesSampledDataMaxLength = 'MeterValuesSampledDataMaxLength',
  MeterValueSampleInterval = 'MeterValueSampleInterval',
  MinimumStatusDuration = 'MinimumStatusDuration',
  NumberOfConnectors = 'NumberOfConnectors',
  ResetRetries = 'ResetRetries',
  ConnectorPhaseRotation = 'ConnectorPhaseRotation',
  ConnectorPhaseRotationMaxLength = 'ConnectorPhaseRotationMaxLength',
  StopTransactionOnEVSideDisconnect = 'StopTransactionOnEVSideDisconnect',
  StopTransactionOnInvalidId = 'StopTransactionOnInvalidId',
  StopTxnAlignedData = 'StopTxnAlignedData',
  StopTxnAlignedDataMaxLength = 'StopTxnAlignedDataMaxLength',
  StopTxnSampledData = 'StopTxnSampledData',
  StopTxnSampledDataMaxLength = 'StopTxnSampledDataMaxLength',
  SupportedFeatureProfiles = 'SupportedFeatureProfiles',
  SupportedFeatureProfilesMaxLength = 'SupportedFeatureProfilesMaxLength',
  TransactionMessageAttempts = 'TransactionMessageAttempts',
  TransactionMessageRetryInterval = 'TransactionMessageRetryInterval',
  UnlockConnectorOnEVSideDisconnect = 'UnlockConnectorOnEVSideDisconnect',
  WebSocketPingInterval = 'WebSocketPingInterval',
  LocalAuthListEnabled = 'LocalAuthListEnabled',
  LocalAuthListMaxLength = 'LocalAuthListMaxLength',
  SendLocalListMaxLength = 'SendLocalListMaxLength',
  ReserveConnectorZeroSupported = 'ReserveConnectorZeroSupported',
  ChargeProfileMaxStackLevel = 'ChargeProfileMaxStackLevel',
  ChargingScheduleAllowedChargingRateUnit = 'ChargingScheduleAllowedChargingRateUnit',
  ChargingScheduleMaxPeriods = 'ChargingScheduleMaxPeriods',
  ConnectorSwitch3to1PhaseSupported = 'ConnectorSwitch3to1PhaseSupported',
  MaxChargingProfilesInstalled = 'MaxChargingProfilesInstalled'
}

export enum OCPP16VendorParametersKey {
  ConnectionUrl = 'ConnectionUrl'
}
