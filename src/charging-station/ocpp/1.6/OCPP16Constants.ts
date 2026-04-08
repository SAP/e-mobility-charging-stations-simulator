import {
  type ConnectorStatusTransition,
  OCPP16ChargePointStatus,
  type OCPP16GetLocalListVersionResponse,
  type OCPP16SendLocalListResponse,
  OCPP16UpdateStatus,
} from '../../../types/index.js'
import { OCPPConstants } from '../OCPPConstants.js'

export class OCPP16Constants extends OCPPConstants {
  static readonly ChargePointStatusChargingStationTransitions: readonly ConnectorStatusTransition[] =
    Object.freeze([
      { to: OCPP16ChargePointStatus.Available },
      // { from: OCPP16ChargePointStatus.Available, to: OCPP16ChargePointStatus.Available },
      {
        from: OCPP16ChargePointStatus.Available,
        to: OCPP16ChargePointStatus.Unavailable,
      },
      {
        from: OCPP16ChargePointStatus.Available,
        to: OCPP16ChargePointStatus.Faulted,
      },
      { to: OCPP16ChargePointStatus.Unavailable },
      {
        from: OCPP16ChargePointStatus.Unavailable,
        to: OCPP16ChargePointStatus.Available,
      },
      // { from: OCPP16ChargePointStatus.Unavailable, to: OCPP16ChargePointStatus.Unavailable },
      {
        from: OCPP16ChargePointStatus.Unavailable,
        to: OCPP16ChargePointStatus.Faulted,
      },
      { to: OCPP16ChargePointStatus.Faulted },
      {
        from: OCPP16ChargePointStatus.Faulted,
        to: OCPP16ChargePointStatus.Available,
      },
      {
        from: OCPP16ChargePointStatus.Faulted,
        to: OCPP16ChargePointStatus.Unavailable,
      },
      // { from: OCPP16ChargePointStatus.Faulted, to: OCPP16ChargePointStatus.Faulted }
    ])

  static readonly ChargePointStatusConnectorTransitions: readonly ConnectorStatusTransition[] =
    Object.freeze([
      { to: OCPP16ChargePointStatus.Available },
      // { from: OCPP16ChargePointStatus.Available, to: OCPP16ChargePointStatus.Available },
      {
        from: OCPP16ChargePointStatus.Available,
        to: OCPP16ChargePointStatus.Preparing,
      },
      {
        from: OCPP16ChargePointStatus.Available,
        to: OCPP16ChargePointStatus.Charging,
      },
      {
        from: OCPP16ChargePointStatus.Available,
        to: OCPP16ChargePointStatus.SuspendedEV,
      },
      {
        from: OCPP16ChargePointStatus.Available,
        to: OCPP16ChargePointStatus.SuspendedEVSE,
      },
      // { from: OCPP16ChargePointStatus.Available, to: OCPP16ChargePointStatus.Finishing },
      {
        from: OCPP16ChargePointStatus.Available,
        to: OCPP16ChargePointStatus.Reserved,
      },
      {
        from: OCPP16ChargePointStatus.Available,
        to: OCPP16ChargePointStatus.Unavailable,
      },
      {
        from: OCPP16ChargePointStatus.Available,
        to: OCPP16ChargePointStatus.Faulted,
      },
      // { to: OCPP16ChargePointStatus.Preparing },
      {
        from: OCPP16ChargePointStatus.Preparing,
        to: OCPP16ChargePointStatus.Available,
      },
      // { from: OCPP16ChargePointStatus.Preparing, to: OCPP16ChargePointStatus.Preparing },
      {
        from: OCPP16ChargePointStatus.Preparing,
        to: OCPP16ChargePointStatus.Charging,
      },
      {
        from: OCPP16ChargePointStatus.Preparing,
        to: OCPP16ChargePointStatus.SuspendedEV,
      },
      {
        from: OCPP16ChargePointStatus.Preparing,
        to: OCPP16ChargePointStatus.SuspendedEVSE,
      },
      {
        from: OCPP16ChargePointStatus.Preparing,
        to: OCPP16ChargePointStatus.Finishing,
      },
      // { from: OCPP16ChargePointStatus.Preparing, to: OCPP16ChargePointStatus.Reserved },
      // { from: OCPP16ChargePointStatus.Preparing, to: OCPP16ChargePointStatus.Unavailable },
      {
        from: OCPP16ChargePointStatus.Preparing,
        to: OCPP16ChargePointStatus.Faulted,
      },
      // { to: OCPP16ChargePointStatus.Charging },
      {
        from: OCPP16ChargePointStatus.Charging,
        to: OCPP16ChargePointStatus.Available,
      },
      // { from: OCPP16ChargePointStatus.Charging, to: OCPP16ChargePointStatus.Preparing },
      // { from: OCPP16ChargePointStatus.Charging, to: OCPP16ChargePointStatus.Charging },
      {
        from: OCPP16ChargePointStatus.Charging,
        to: OCPP16ChargePointStatus.SuspendedEV,
      },
      {
        from: OCPP16ChargePointStatus.Charging,
        to: OCPP16ChargePointStatus.SuspendedEVSE,
      },
      {
        from: OCPP16ChargePointStatus.Charging,
        to: OCPP16ChargePointStatus.Finishing,
      },
      // { from: OCPP16ChargePointStatus.Charging, to: OCPP16ChargePointStatus.Reserved },
      {
        from: OCPP16ChargePointStatus.Charging,
        to: OCPP16ChargePointStatus.Unavailable,
      },
      {
        from: OCPP16ChargePointStatus.Charging,
        to: OCPP16ChargePointStatus.Faulted,
      },
      // { to: OCPP16ChargePointStatus.SuspendedEV },
      {
        from: OCPP16ChargePointStatus.SuspendedEV,
        to: OCPP16ChargePointStatus.Available,
      },
      // { from: OCPP16ChargePointStatus.SuspendedEV, to: OCPP16ChargePointStatus.Preparing },
      {
        from: OCPP16ChargePointStatus.SuspendedEV,
        to: OCPP16ChargePointStatus.Charging,
      },
      // { from: OCPP16ChargePointStatus.SuspendedEV, OCPP16ChargePointStatus.SuspendedEV },
      {
        from: OCPP16ChargePointStatus.SuspendedEV,
        to: OCPP16ChargePointStatus.SuspendedEVSE,
      },
      {
        from: OCPP16ChargePointStatus.SuspendedEV,
        to: OCPP16ChargePointStatus.Finishing,
      },
      // { from: OCPP16ChargePointStatus.SuspendedEV, to: OCPP16ChargePointStatus.Reserved },
      {
        from: OCPP16ChargePointStatus.SuspendedEV,
        to: OCPP16ChargePointStatus.Unavailable,
      },
      {
        from: OCPP16ChargePointStatus.SuspendedEV,
        to: OCPP16ChargePointStatus.Faulted,
      },
      // { to: OCPP16ChargePointStatus.SuspendedEVSE },
      {
        from: OCPP16ChargePointStatus.SuspendedEVSE,
        to: OCPP16ChargePointStatus.Available,
      },
      // { from: OCPP16ChargePointStatus.SuspendedEVSE, to: OCPP16ChargePointStatus.Preparing },
      {
        from: OCPP16ChargePointStatus.SuspendedEVSE,
        to: OCPP16ChargePointStatus.Charging,
      },
      {
        from: OCPP16ChargePointStatus.SuspendedEVSE,
        to: OCPP16ChargePointStatus.SuspendedEV,
      },
      // { from: OCPP16ChargePointStatus.SuspendedEVSE, to: OCPP16ChargePointStatus.SuspendedEVSE },
      {
        from: OCPP16ChargePointStatus.SuspendedEVSE,
        to: OCPP16ChargePointStatus.Finishing,
      },
      // { from: OCPP16ChargePointStatus.SuspendedEVSE, to: OCPP16ChargePointStatus.Reserved },
      {
        from: OCPP16ChargePointStatus.SuspendedEVSE,
        to: OCPP16ChargePointStatus.Unavailable,
      },
      {
        from: OCPP16ChargePointStatus.SuspendedEVSE,
        to: OCPP16ChargePointStatus.Faulted,
      },
      // { to: OCPP16ChargePointStatus.Finishing},
      {
        from: OCPP16ChargePointStatus.Finishing,
        to: OCPP16ChargePointStatus.Available,
      },
      {
        from: OCPP16ChargePointStatus.Finishing,
        to: OCPP16ChargePointStatus.Preparing,
      },
      // { from: OCPP16ChargePointStatus.Finishing, to: OCPP16ChargePointStatus.Charging },
      // { from: OCPP16ChargePointStatus.Finishing, to: OCPP16ChargePointStatus.SuspendedEV },
      // { from: OCPP16ChargePointStatus.Finishing, to: OCPP16ChargePointStatus.SuspendedEVSE },
      // { from: OCPP16ChargePointStatus.Finishing, to: OCPP16ChargePointStatus.Finishing },
      // { from: OCPP16ChargePointStatus.Finishing, to: OCPP16ChargePointStatus.Reserved },
      {
        from: OCPP16ChargePointStatus.Finishing,
        to: OCPP16ChargePointStatus.Unavailable,
      },
      {
        from: OCPP16ChargePointStatus.Finishing,
        to: OCPP16ChargePointStatus.Faulted,
      },
      // { to: OCPP16ChargePointStatus.Reserved },
      {
        from: OCPP16ChargePointStatus.Reserved,
        to: OCPP16ChargePointStatus.Available,
      },
      {
        from: OCPP16ChargePointStatus.Reserved,
        to: OCPP16ChargePointStatus.Preparing,
      },
      // { from: OCPP16ChargePointStatus.Reserved, to: OCPP16ChargePointStatus.Charging },
      // { from: OCPP16ChargePointStatus.Reserved, to: OCPP16ChargePointStatus.SuspendedEV },
      // { from: OCPP16ChargePointStatus.Reserved, to: OCPP16ChargePointStatus.SuspendedEVSE },
      // { from: OCPP16ChargePointStatus.Reserved, to: OCPP16ChargePointStatus.Finishing },
      // { from: OCPP16ChargePointStatus.Reserved, to: OCPP16ChargePointStatus.Reserved },
      {
        from: OCPP16ChargePointStatus.Reserved,
        to: OCPP16ChargePointStatus.Unavailable,
      },
      {
        from: OCPP16ChargePointStatus.Reserved,
        to: OCPP16ChargePointStatus.Faulted,
      },
      { to: OCPP16ChargePointStatus.Unavailable },
      {
        from: OCPP16ChargePointStatus.Unavailable,
        to: OCPP16ChargePointStatus.Available,
      },
      {
        from: OCPP16ChargePointStatus.Unavailable,
        to: OCPP16ChargePointStatus.Preparing,
      },
      {
        from: OCPP16ChargePointStatus.Unavailable,
        to: OCPP16ChargePointStatus.Charging,
      },
      {
        from: OCPP16ChargePointStatus.Unavailable,
        to: OCPP16ChargePointStatus.SuspendedEV,
      },
      {
        from: OCPP16ChargePointStatus.Unavailable,
        to: OCPP16ChargePointStatus.SuspendedEVSE,
      },
      // { from: OCPP16ChargePointStatus.Unavailable, to: OCPP16ChargePointStatus.Finishing },
      // { from: OCPP16ChargePointStatus.Unavailable, to: OCPP16ChargePointStatus.Reserved },
      // { from: OCPP16ChargePointStatus.Unavailable, to: OCPP16ChargePointStatus.Unavailable },
      {
        from: OCPP16ChargePointStatus.Unavailable,
        to: OCPP16ChargePointStatus.Faulted,
      },
      { to: OCPP16ChargePointStatus.Faulted },
      {
        from: OCPP16ChargePointStatus.Faulted,
        to: OCPP16ChargePointStatus.Available,
      },
      {
        from: OCPP16ChargePointStatus.Faulted,
        to: OCPP16ChargePointStatus.Preparing,
      },
      {
        from: OCPP16ChargePointStatus.Faulted,
        to: OCPP16ChargePointStatus.Charging,
      },
      {
        from: OCPP16ChargePointStatus.Faulted,
        to: OCPP16ChargePointStatus.SuspendedEV,
      },
      {
        from: OCPP16ChargePointStatus.Faulted,
        to: OCPP16ChargePointStatus.SuspendedEVSE,
      },
      {
        from: OCPP16ChargePointStatus.Faulted,
        to: OCPP16ChargePointStatus.Finishing,
      },
      {
        from: OCPP16ChargePointStatus.Faulted,
        to: OCPP16ChargePointStatus.Reserved,
      },
      {
        from: OCPP16ChargePointStatus.Faulted,
        to: OCPP16ChargePointStatus.Unavailable,
      },
      // { from: OCPP16ChargePointStatus.Faulted, to: OCPP16ChargePointStatus.Faulted }
    ])

  static readonly OCPP_DEFAULT_IDTAG = '00000000'

  static readonly OCPP_GET_LOCAL_LIST_VERSION_RESPONSE_NOT_SUPPORTED: OCPP16GetLocalListVersionResponse =
    Object.freeze({ listVersion: -1 })

  static readonly OCPP_SEND_LOCAL_LIST_RESPONSE_ACCEPTED: OCPP16SendLocalListResponse =
    Object.freeze({ status: OCPP16UpdateStatus.Accepted })

  static readonly OCPP_SEND_LOCAL_LIST_RESPONSE_FAILED: OCPP16SendLocalListResponse = Object.freeze(
    { status: OCPP16UpdateStatus.Failed }
  )

  static readonly OCPP_SEND_LOCAL_LIST_RESPONSE_NOT_SUPPORTED: OCPP16SendLocalListResponse =
    Object.freeze({ status: OCPP16UpdateStatus.NotSupported })

  static readonly OCPP_SEND_LOCAL_LIST_RESPONSE_VERSION_MISMATCH: OCPP16SendLocalListResponse =
    Object.freeze({ status: OCPP16UpdateStatus.VersionMismatch })
}
