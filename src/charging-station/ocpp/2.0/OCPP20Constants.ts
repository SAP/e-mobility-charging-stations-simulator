import { OCPP20ConnectorStatusEnumType } from '../../../types';
import { OCPPConstants } from '../internal';

type Transition = Readonly<{
  from?: OCPP20ConnectorStatusEnumType;
  to: OCPP20ConnectorStatusEnumType;
}>;

export class OCPP20Constants extends OCPPConstants {
  static readonly ChargingStationStatusTransitions: Readonly<Transition[]> = Object.freeze([
    { to: OCPP20ConnectorStatusEnumType.Available },
    // { from: OCPP20ConnectorStatusEnumType.Available, to: OCPP20ConnectorStatusEnumType.Available },
    {
      from: OCPP20ConnectorStatusEnumType.Available,
      to: OCPP20ConnectorStatusEnumType.Unavailable,
    },
    { from: OCPP20ConnectorStatusEnumType.Available, to: OCPP20ConnectorStatusEnumType.Faulted },
    { to: OCPP20ConnectorStatusEnumType.Unavailable },
    {
      from: OCPP20ConnectorStatusEnumType.Unavailable,
      to: OCPP20ConnectorStatusEnumType.Available,
    },
    // {
    //   from: OCPP20ConnectorStatusEnumType.Unavailable,
    //   to: OCPP20ConnectorStatusEnumType.Unavailable,
    // },
    { from: OCPP20ConnectorStatusEnumType.Unavailable, to: OCPP20ConnectorStatusEnumType.Faulted },
    { to: OCPP20ConnectorStatusEnumType.Faulted },
    { from: OCPP20ConnectorStatusEnumType.Faulted, to: OCPP20ConnectorStatusEnumType.Available },
    { from: OCPP20ConnectorStatusEnumType.Faulted, to: OCPP20ConnectorStatusEnumType.Unavailable },
    // { from: OCPP20ConnectorStatusEnumType.Faulted, to: OCPP20ConnectorStatusEnumType.Faulted },
  ]);

  static readonly ConnectorStatusTransitions: Readonly<Transition[]> = Object.freeze([
    { to: OCPP20ConnectorStatusEnumType.Available },
    // { from: OCPP20ConnectorStatusEnumType.Available, to: OCPP20ConnectorStatusEnumType.Available },
    { from: OCPP20ConnectorStatusEnumType.Available, to: OCPP20ConnectorStatusEnumType.Occupied },
    { from: OCPP20ConnectorStatusEnumType.Available, to: OCPP20ConnectorStatusEnumType.Reserved },
    {
      from: OCPP20ConnectorStatusEnumType.Available,
      to: OCPP20ConnectorStatusEnumType.Unavailable,
    },
    { from: OCPP20ConnectorStatusEnumType.Available, to: OCPP20ConnectorStatusEnumType.Faulted },
    // { to: OCPP20ConnectorStatusEnumType.Occupied },
    { from: OCPP20ConnectorStatusEnumType.Occupied, to: OCPP20ConnectorStatusEnumType.Available },
    // { from: OCPP20ConnectorStatusEnumType.Occupied, to: OCPP20ConnectorStatusEnumType.Occupied },
    // { from: OCPP20ConnectorStatusEnumType.Occupied, to: OCPP20ConnectorStatusEnumType.Reserved },
    { from: OCPP20ConnectorStatusEnumType.Occupied, to: OCPP20ConnectorStatusEnumType.Unavailable },
    { from: OCPP20ConnectorStatusEnumType.Occupied, to: OCPP20ConnectorStatusEnumType.Faulted },
    // { to: OCPP20ConnectorStatusEnumType.Reserved },
    { from: OCPP20ConnectorStatusEnumType.Reserved, to: OCPP20ConnectorStatusEnumType.Available },
    { from: OCPP20ConnectorStatusEnumType.Reserved, to: OCPP20ConnectorStatusEnumType.Occupied },
    // { from: OCPP20ConnectorStatusEnumType.Reserved, to: OCPP20ConnectorStatusEnumType.Reserved },
    { from: OCPP20ConnectorStatusEnumType.Reserved, to: OCPP20ConnectorStatusEnumType.Unavailable },
    { from: OCPP20ConnectorStatusEnumType.Reserved, to: OCPP20ConnectorStatusEnumType.Faulted },
    { to: OCPP20ConnectorStatusEnumType.Unavailable },
    {
      from: OCPP20ConnectorStatusEnumType.Unavailable,
      to: OCPP20ConnectorStatusEnumType.Available,
    },
    { from: OCPP20ConnectorStatusEnumType.Unavailable, to: OCPP20ConnectorStatusEnumType.Occupied },
    // { from: OCPP20ConnectorStatusEnumType.Unavailable, to: OCPP20ConnectorStatusEnumType.Reserved },
    // { from: OCPP20ConnectorStatusEnumType.Unavailable, to: OCPP20ConnectorStatusEnumType.Unavailable },
    { from: OCPP20ConnectorStatusEnumType.Unavailable, to: OCPP20ConnectorStatusEnumType.Faulted },
    { to: OCPP20ConnectorStatusEnumType.Faulted },
    { from: OCPP20ConnectorStatusEnumType.Faulted, to: OCPP20ConnectorStatusEnumType.Available },
    { from: OCPP20ConnectorStatusEnumType.Faulted, to: OCPP20ConnectorStatusEnumType.Occupied },
    { from: OCPP20ConnectorStatusEnumType.Faulted, to: OCPP20ConnectorStatusEnumType.Reserved },
    { from: OCPP20ConnectorStatusEnumType.Faulted, to: OCPP20ConnectorStatusEnumType.Unavailable },
    // { from: OCPP20ConnectorStatusEnumType.Faulted, to: OCPP20ConnectorStatusEnumType.Faulted },
  ]);
}
