import { type ConnectorStatusTransition, OCPP16ChargePointStatus } from '../../../types/index.js'
import { OCPPConstants } from '../OCPPConstants.js'

export class OCPP16Constants extends OCPPConstants {
  static readonly ChargePointStatusChargingStationTransitions: Readonly<
  ConnectorStatusTransition[]
  > = Object.freeze([
      { to: OCPP16ChargePointStatus.Available },
      // { from: OCPP16ChargePointStatus.Available, to: OCPP16ChargePointStatus.Available },
      {
        from: OCPP16ChargePointStatus.Available,
        to: OCPP16ChargePointStatus.Unavailable
      },
      {
        from: OCPP16ChargePointStatus.Available,
        to: OCPP16ChargePointStatus.Faulted
      },
      { to: OCPP16ChargePointStatus.Unavailable },
      {
        from: OCPP16ChargePointStatus.Unavailable,
        to: OCPP16ChargePointStatus.Available
      },
      // { from: OCPP16ChargePointStatus.Unavailable, to: OCPP16ChargePointStatus.Unavailable },
      {
        from: OCPP16ChargePointStatus.Unavailable,
        to: OCPP16ChargePointStatus.Faulted
      },
      { to: OCPP16ChargePointStatus.Faulted },
      {
        from: OCPP16ChargePointStatus.Faulted,
        to: OCPP16ChargePointStatus.Available
      },
      {
        from: OCPP16ChargePointStatus.Faulted,
        to: OCPP16ChargePointStatus.Unavailable
      }
    // { from: OCPP16ChargePointStatus.Faulted, to: OCPP16ChargePointStatus.Faulted }
    ])

  static readonly ChargePointStatusConnectorTransitions: Readonly<ConnectorStatusTransition[]> =
    Object.freeze([
      { to: OCPP16ChargePointStatus.Available },
      // { from: OCPP16ChargePointStatus.Available, to: OCPP16ChargePointStatus.Available },
      {
        from: OCPP16ChargePointStatus.Available,
        to: OCPP16ChargePointStatus.Preparing
      },
      {
        from: OCPP16ChargePointStatus.Available,
        to: OCPP16ChargePointStatus.Charging
      },
      {
        from: OCPP16ChargePointStatus.Available,
        to: OCPP16ChargePointStatus.SuspendedEV
      },
      {
        from: OCPP16ChargePointStatus.Available,
        to: OCPP16ChargePointStatus.SuspendedEVSE
      },
      // { from: OCPP16ChargePointStatus.Available, to: OCPP16ChargePointStatus.Finishing },
      {
        from: OCPP16ChargePointStatus.Available,
        to: OCPP16ChargePointStatus.Reserved
      },
      {
        from: OCPP16ChargePointStatus.Available,
        to: OCPP16ChargePointStatus.Unavailable
      },
      {
        from: OCPP16ChargePointStatus.Available,
        to: OCPP16ChargePointStatus.Faulted
      },
      // { to: OCPP16ChargePointStatus.Preparing },
      {
        from: OCPP16ChargePointStatus.Preparing,
        to: OCPP16ChargePointStatus.Available
      },
      // { from: OCPP16ChargePointStatus.Preparing, to: OCPP16ChargePointStatus.Preparing },
      {
        from: OCPP16ChargePointStatus.Preparing,
        to: OCPP16ChargePointStatus.Charging
      },
      {
        from: OCPP16ChargePointStatus.Preparing,
        to: OCPP16ChargePointStatus.SuspendedEV
      },
      {
        from: OCPP16ChargePointStatus.Preparing,
        to: OCPP16ChargePointStatus.SuspendedEVSE
      },
      {
        from: OCPP16ChargePointStatus.Preparing,
        to: OCPP16ChargePointStatus.Finishing
      },
      // { from: OCPP16ChargePointStatus.Preparing, to: OCPP16ChargePointStatus.Reserved },
      // { from: OCPP16ChargePointStatus.Preparing, to: OCPP16ChargePointStatus.Unavailable },
      {
        from: OCPP16ChargePointStatus.Preparing,
        to: OCPP16ChargePointStatus.Faulted
      },
      // { to: OCPP16ChargePointStatus.Charging },
      {
        from: OCPP16ChargePointStatus.Charging,
        to: OCPP16ChargePointStatus.Available
      },
      // { from: OCPP16ChargePointStatus.Charging, to: OCPP16ChargePointStatus.Preparing },
      // { from: OCPP16ChargePointStatus.Charging, to: OCPP16ChargePointStatus.Charging },
      {
        from: OCPP16ChargePointStatus.Charging,
        to: OCPP16ChargePointStatus.SuspendedEV
      },
      {
        from: OCPP16ChargePointStatus.Charging,
        to: OCPP16ChargePointStatus.SuspendedEVSE
      },
      {
        from: OCPP16ChargePointStatus.Charging,
        to: OCPP16ChargePointStatus.Finishing
      },
      // { from: OCPP16ChargePointStatus.Charging, to: OCPP16ChargePointStatus.Reserved },
      {
        from: OCPP16ChargePointStatus.Charging,
        to: OCPP16ChargePointStatus.Unavailable
      },
      {
        from: OCPP16ChargePointStatus.Charging,
        to: OCPP16ChargePointStatus.Faulted
      },
      // { to: OCPP16ChargePointStatus.SuspendedEV },
      {
        from: OCPP16ChargePointStatus.SuspendedEV,
        to: OCPP16ChargePointStatus.Available
      },
      // { from: OCPP16ChargePointStatus.SuspendedEV, to: OCPP16ChargePointStatus.Preparing },
      {
        from: OCPP16ChargePointStatus.SuspendedEV,
        to: OCPP16ChargePointStatus.Charging
      },
      // { from: OCPP16ChargePointStatus.SuspendedEV, OCPP16ChargePointStatus.SuspendedEV },
      {
        from: OCPP16ChargePointStatus.SuspendedEV,
        to: OCPP16ChargePointStatus.SuspendedEVSE
      },
      {
        from: OCPP16ChargePointStatus.SuspendedEV,
        to: OCPP16ChargePointStatus.Finishing
      },
      // { from: OCPP16ChargePointStatus.SuspendedEV, to: OCPP16ChargePointStatus.Reserved },
      {
        from: OCPP16ChargePointStatus.SuspendedEV,
        to: OCPP16ChargePointStatus.Unavailable
      },
      {
        from: OCPP16ChargePointStatus.SuspendedEV,
        to: OCPP16ChargePointStatus.Faulted
      },
      // { to: OCPP16ChargePointStatus.SuspendedEVSE },
      {
        from: OCPP16ChargePointStatus.SuspendedEVSE,
        to: OCPP16ChargePointStatus.Available
      },
      // { from: OCPP16ChargePointStatus.SuspendedEVSE, to: OCPP16ChargePointStatus.Preparing },
      {
        from: OCPP16ChargePointStatus.SuspendedEVSE,
        to: OCPP16ChargePointStatus.Charging
      },
      {
        from: OCPP16ChargePointStatus.SuspendedEVSE,
        to: OCPP16ChargePointStatus.SuspendedEV
      },
      // { from: OCPP16ChargePointStatus.SuspendedEVSE, to: OCPP16ChargePointStatus.SuspendedEVSE },
      {
        from: OCPP16ChargePointStatus.SuspendedEVSE,
        to: OCPP16ChargePointStatus.Finishing
      },
      // { from: OCPP16ChargePointStatus.SuspendedEVSE, to: OCPP16ChargePointStatus.Reserved },
      {
        from: OCPP16ChargePointStatus.SuspendedEVSE,
        to: OCPP16ChargePointStatus.Unavailable
      },
      {
        from: OCPP16ChargePointStatus.SuspendedEVSE,
        to: OCPP16ChargePointStatus.Faulted
      },
      // { to: OCPP16ChargePointStatus.Finishing},
      {
        from: OCPP16ChargePointStatus.Finishing,
        to: OCPP16ChargePointStatus.Available
      },
      {
        from: OCPP16ChargePointStatus.Finishing,
        to: OCPP16ChargePointStatus.Preparing
      },
      // { from: OCPP16ChargePointStatus.Finishing, to: OCPP16ChargePointStatus.Charging },
      // { from: OCPP16ChargePointStatus.Finishing, to: OCPP16ChargePointStatus.SuspendedEV },
      // { from: OCPP16ChargePointStatus.Finishing, to: OCPP16ChargePointStatus.SuspendedEVSE },
      // { from: OCPP16ChargePointStatus.Finishing, to: OCPP16ChargePointStatus.Finishing },
      // { from: OCPP16ChargePointStatus.Finishing, to: OCPP16ChargePointStatus.Reserved },
      {
        from: OCPP16ChargePointStatus.Finishing,
        to: OCPP16ChargePointStatus.Unavailable
      },
      {
        from: OCPP16ChargePointStatus.Finishing,
        to: OCPP16ChargePointStatus.Faulted
      },
      // { to: OCPP16ChargePointStatus.Reserved },
      {
        from: OCPP16ChargePointStatus.Reserved,
        to: OCPP16ChargePointStatus.Available
      },
      {
        from: OCPP16ChargePointStatus.Reserved,
        to: OCPP16ChargePointStatus.Preparing
      },
      // { from: OCPP16ChargePointStatus.Reserved, to: OCPP16ChargePointStatus.Charging },
      // { from: OCPP16ChargePointStatus.Reserved, to: OCPP16ChargePointStatus.SuspendedEV },
      // { from: OCPP16ChargePointStatus.Reserved, to: OCPP16ChargePointStatus.SuspendedEVSE },
      // { from: OCPP16ChargePointStatus.Reserved, to: OCPP16ChargePointStatus.Finishing },
      // { from: OCPP16ChargePointStatus.Reserved, to: OCPP16ChargePointStatus.Reserved },
      {
        from: OCPP16ChargePointStatus.Reserved,
        to: OCPP16ChargePointStatus.Unavailable
      },
      {
        from: OCPP16ChargePointStatus.Reserved,
        to: OCPP16ChargePointStatus.Faulted
      },
      { to: OCPP16ChargePointStatus.Unavailable },
      {
        from: OCPP16ChargePointStatus.Unavailable,
        to: OCPP16ChargePointStatus.Available
      },
      {
        from: OCPP16ChargePointStatus.Unavailable,
        to: OCPP16ChargePointStatus.Preparing
      },
      {
        from: OCPP16ChargePointStatus.Unavailable,
        to: OCPP16ChargePointStatus.Charging
      },
      {
        from: OCPP16ChargePointStatus.Unavailable,
        to: OCPP16ChargePointStatus.SuspendedEV
      },
      {
        from: OCPP16ChargePointStatus.Unavailable,
        to: OCPP16ChargePointStatus.SuspendedEVSE
      },
      // { from: OCPP16ChargePointStatus.Unavailable, to: OCPP16ChargePointStatus.Finishing },
      // { from: OCPP16ChargePointStatus.Unavailable, to: OCPP16ChargePointStatus.Reserved },
      // { from: OCPP16ChargePointStatus.Unavailable, to: OCPP16ChargePointStatus.Unavailable },
      {
        from: OCPP16ChargePointStatus.Unavailable,
        to: OCPP16ChargePointStatus.Faulted
      },
      { to: OCPP16ChargePointStatus.Faulted },
      {
        from: OCPP16ChargePointStatus.Faulted,
        to: OCPP16ChargePointStatus.Available
      },
      {
        from: OCPP16ChargePointStatus.Faulted,
        to: OCPP16ChargePointStatus.Preparing
      },
      {
        from: OCPP16ChargePointStatus.Faulted,
        to: OCPP16ChargePointStatus.Charging
      },
      {
        from: OCPP16ChargePointStatus.Faulted,
        to: OCPP16ChargePointStatus.SuspendedEV
      },
      {
        from: OCPP16ChargePointStatus.Faulted,
        to: OCPP16ChargePointStatus.SuspendedEVSE
      },
      {
        from: OCPP16ChargePointStatus.Faulted,
        to: OCPP16ChargePointStatus.Finishing
      },
      {
        from: OCPP16ChargePointStatus.Faulted,
        to: OCPP16ChargePointStatus.Reserved
      },
      {
        from: OCPP16ChargePointStatus.Faulted,
        to: OCPP16ChargePointStatus.Unavailable
      }
      // { from: OCPP16ChargePointStatus.Faulted, to: OCPP16ChargePointStatus.Faulted }
    ])
}
