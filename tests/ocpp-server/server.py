import argparse
import asyncio
import logging
from datetime import datetime, timezone
from functools import partial
from random import randint
from typing import Optional

import ocpp.v201
import websockets
from ocpp.routing import on
from ocpp.v201.enums import (
    Action,
    AuthorizationStatusEnumType,
    ChangeAvailabilityStatusEnumType,
    ClearCacheStatusEnumType,
    DataTransferStatusEnumType,
    GenericDeviceModelStatusEnumType,
    MessageTriggerEnumType,
    OperationalStatusEnumType,
    RegistrationStatusEnumType,
    ReportBaseEnumType,
    ResetEnumType,
    ResetStatusEnumType,
    TransactionEventEnumType,
    TriggerMessageStatusEnumType,
    UnlockStatusEnumType,
)
from websockets import ConnectionClosed

from timer import Timer

# Setting up the logging configuration to display debug level messages.
logging.basicConfig(level=logging.DEBUG)

ChargePoints = set()


class ChargePoint(ocpp.v201.ChargePoint):
    _command_timer: Optional[Timer]

    def __init__(self, connection):
        super().__init__(connection.path.strip("/"), connection)
        self._command_timer = None

    # Message handlers to receive OCPP messages.
    @on(Action.boot_notification)
    async def on_boot_notification(self, charging_station, reason, **kwargs):
        logging.info("Received %s", Action.boot_notification)
        # Create and return a BootNotification response with the current time,
        # an interval of 60 seconds, and an accepted status.
        return ocpp.v201.call_result.BootNotification(
            current_time=datetime.now(timezone.utc).isoformat(),
            interval=60,
            status=RegistrationStatusEnumType.accepted,
        )

    @on(Action.heartbeat)
    async def on_heartbeat(self, **kwargs):
        logging.info("Received %s", Action.heartbeat)
        return ocpp.v201.call_result.Heartbeat(
            current_time=datetime.now(timezone.utc).isoformat()
        )

    @on(Action.status_notification)
    async def on_status_notification(
        self, timestamp, evse_id: int, connector_id: int, connector_status, **kwargs
    ):
        logging.info("Received %s", Action.status_notification)
        return ocpp.v201.call_result.StatusNotification()

    @on(Action.authorize)
    async def on_authorize(self, id_token, **kwargs):
        logging.info("Received %s", Action.authorize)
        return ocpp.v201.call_result.Authorize(
            id_token_info={"status": AuthorizationStatusEnumType.accepted}
        )

    @on(Action.transaction_event)
    async def on_transaction_event(
        self,
        event_type: TransactionEventEnumType,
        timestamp,
        trigger_reason,
        seq_no: int,
        transaction_info,
        **kwargs,
    ):
        match event_type:
            case TransactionEventEnumType.started:
                logging.info("Received %s Started", Action.transaction_event)
                return ocpp.v201.call_result.TransactionEvent(
                    id_token_info={"status": AuthorizationStatusEnumType.accepted}
                )
            case TransactionEventEnumType.updated:
                logging.info("Received %s Updated", Action.transaction_event)
                return ocpp.v201.call_result.TransactionEvent(total_cost=10)
            case TransactionEventEnumType.ended:
                logging.info("Received %s Ended", Action.transaction_event)
                return ocpp.v201.call_result.TransactionEvent()

    @on(Action.meter_values)
    async def on_meter_values(self, evse_id: int, meter_value, **kwargs):
        logging.info("Received %s", Action.meter_values)
        return ocpp.v201.call_result.MeterValues()

    @on(Action.notify_report)
    async def on_notify_report(
        self, request_id: int, generated_at, seq_no: int, **kwargs
    ):
        logging.info("Received %s", Action.notify_report)
        return ocpp.v201.call_result.NotifyReport()

    @on(Action.data_transfer)
    async def on_data_transfer(self, vendor_id: str, **kwargs):
        logging.info("Received %s", Action.data_transfer)
        return ocpp.v201.call_result.DataTransfer(
            status=DataTransferStatusEnumType.accepted
        )

    @on(Action.firmware_status_notification)
    async def on_firmware_status_notification(self, status, **kwargs):
        logging.info("Received %s", Action.firmware_status_notification)
        return ocpp.v201.call_result.FirmwareStatusNotification()

    @on(Action.log_status_notification)
    async def on_log_status_notification(self, status, request_id: int, **kwargs):
        logging.info("Received %s", Action.log_status_notification)
        return ocpp.v201.call_result.LogStatusNotification()

    @on(Action.security_event_notification)
    async def on_security_event_notification(self, event_type, timestamp, **kwargs):
        logging.info("Received %s", Action.security_event_notification)
        return ocpp.v201.call_result.SecurityEventNotification()

    # Request handlers to emit OCPP messages.
    async def _send_clear_cache(self):
        request = ocpp.v201.call.ClearCache()
        response = await self.call(request)

        if response.status == ClearCacheStatusEnumType.accepted:
            logging.info("%s successful", Action.clear_cache)
        else:
            logging.info("%s failed", Action.clear_cache)

    async def _send_get_base_report(self):
        request = ocpp.v201.call.GetBaseReport(
            request_id=randint(1, 100),  # noqa: S311
            report_base=ReportBaseEnumType.full_inventory,
        )
        response = await self.call(request)

        if response.status == GenericDeviceModelStatusEnumType.accepted:
            logging.info("%s successful", Action.get_base_report)
        else:
            logging.info("%s failed", Action.get_base_report)

    async def _send_get_variables(self):
        request = ocpp.v201.call.GetVariables(
            get_variable_data=[
                {
                    "component": {"name": "ChargingStation"},
                    "variable": {"name": "AvailabilityState"},
                }
            ]
        )
        await self.call(request)
        logging.info("%s response received", Action.get_variables)

    async def _send_set_variables(self):
        request = ocpp.v201.call.SetVariables(
            set_variable_data=[
                {
                    "component": {"name": "ChargingStation"},
                    "variable": {"name": "HeartbeatInterval"},
                    "attribute_value": "30",
                }
            ]
        )
        await self.call(request)
        logging.info("%s response received", Action.set_variables)

    async def _send_request_start_transaction(self):
        request = ocpp.v201.call.RequestStartTransaction(
            id_token={"id_token": "test_token", "type": "ISO14443"},
            evse_id=1,
            remote_start_id=randint(1, 1000),  # noqa: S311
        )
        await self.call(request)
        logging.info("%s response received", Action.request_start_transaction)

    async def _send_request_stop_transaction(self):
        request = ocpp.v201.call.RequestStopTransaction(
            transaction_id="test_transaction_123"
        )
        await self.call(request)
        logging.info("%s response received", Action.request_stop_transaction)

    async def _send_reset(self):
        request = ocpp.v201.call.Reset(type=ResetEnumType.immediate)
        response = await self.call(request)

        if (
            hasattr(response, "status")
            and response.status == ResetStatusEnumType.accepted
        ):
            logging.info("%s successful", Action.reset)
        else:
            logging.info("%s failed", Action.reset)

    async def _send_unlock_connector(self):
        request = ocpp.v201.call.UnlockConnector(evse_id=1, connector_id=1)
        response = await self.call(request)

        if response.status == UnlockStatusEnumType.unlocked:
            logging.info("%s successful", Action.unlock_connector)
        else:
            logging.info("%s failed", Action.unlock_connector)

    async def _send_change_availability(self):
        request = ocpp.v201.call.ChangeAvailability(
            operational_status=OperationalStatusEnumType.operative
        )
        response = await self.call(request)

        if (
            hasattr(response, "status")
            and response.status == ChangeAvailabilityStatusEnumType.accepted
        ):
            logging.info("%s successful", Action.change_availability)
        else:
            logging.info("%s failed", Action.change_availability)

    async def _send_trigger_message(self):
        request = ocpp.v201.call.TriggerMessage(
            requested_message=MessageTriggerEnumType.status_notification
        )
        response = await self.call(request)

        if (
            hasattr(response, "status")
            and response.status == TriggerMessageStatusEnumType.accepted
        ):
            logging.info("%s successful", Action.trigger_message)
        else:
            logging.info("%s failed", Action.trigger_message)

    async def _send_data_transfer(self):
        request = ocpp.v201.call.DataTransfer(
            vendor_id="TestVendor", message_id="TestMessage", data="test_data"
        )
        response = await self.call(request)

        if response.status == DataTransferStatusEnumType.accepted:
            logging.info("%s successful", Action.data_transfer)
        else:
            logging.info("%s failed", Action.data_transfer)

    async def _send_command(self, command_name: Action):
        logging.debug("Sending OCPP command %s", command_name)
        match command_name:
            case Action.clear_cache:
                await self._send_clear_cache()
            case Action.get_base_report:
                await self._send_get_base_report()
            case Action.get_variables:
                await self._send_get_variables()
            case Action.set_variables:
                await self._send_set_variables()
            case Action.request_start_transaction:
                await self._send_request_start_transaction()
            case Action.request_stop_transaction:
                await self._send_request_stop_transaction()
            case Action.reset:
                await self._send_reset()
            case Action.unlock_connector:
                await self._send_unlock_connector()
            case Action.change_availability:
                await self._send_change_availability()
            case Action.trigger_message:
                await self._send_trigger_message()
            case Action.data_transfer:
                await self._send_data_transfer()
            case _:
                logging.info(f"Not supported command {command_name}")

    async def send_command(
        self, command_name: Action, delay: Optional[float], period: Optional[float]
    ):
        try:
            if delay and not self._command_timer:
                self._command_timer = Timer(
                    delay,
                    False,
                    self._send_command,
                    [command_name],
                )
            if period and not self._command_timer:
                self._command_timer = Timer(
                    period,
                    True,
                    self._send_command,
                    [command_name],
                )
        except ConnectionClosed:
            self.handle_connection_closed()

    def handle_connection_closed(self):
        logging.info("ChargePoint %s closed connection", self.id)
        if self._command_timer:
            self._command_timer.cancel()
        ChargePoints.remove(self)
        logging.debug("Connected ChargePoint(s): %d", len(ChargePoints))


# Function to handle new WebSocket connections.
async def on_connect(
    websocket,
    command_name: Optional[Action],
    delay: Optional[float],
    period: Optional[float],
):
    """For every new charge point that connects, create a ChargePoint instance and start
    listening for messages.
    """
    try:
        requested_protocols = websocket.request_headers["Sec-WebSocket-Protocol"]
    except KeyError:
        logging.info("Client hasn't requested any Subprotocol. Closing Connection")
        return await websocket.close()

    if websocket.subprotocol:
        logging.info("Protocols Matched: %s", websocket.subprotocol)
    else:
        logging.warning(
            "Protocols Mismatched | Expected Subprotocols: %s,"
            " but client supports %s | Closing connection",
            websocket.available_subprotocols,
            requested_protocols,
        )
        return await websocket.close()

    cp = ChargePoint(websocket)
    if command_name:
        await cp.send_command(command_name, delay, period)

    ChargePoints.add(cp)

    try:
        await cp.start()
    except ConnectionClosed:
        cp.handle_connection_closed()


def check_positive_number(value: Optional[float]):
    try:
        value = float(value)
    except ValueError:
        raise argparse.ArgumentTypeError("must be a number") from None
    if value <= 0:
        raise argparse.ArgumentTypeError("must be a positive number")
    return value


# Main function to start the WebSocket server.
async def main():
    parser = argparse.ArgumentParser(description="OCPP2 Server")
    parser.add_argument("-c", "--command", type=Action, help="command name")
    group = parser.add_mutually_exclusive_group()
    group.add_argument(
        "-d",
        "--delay",
        type=check_positive_number,
        help="delay in seconds",
    )
    group.add_argument(
        "-p",
        "--period",
        type=check_positive_number,
        help="period in seconds",
    )
    group.required = parser.parse_known_args()[0].command is not None

    args = parser.parse_args()

    # Create the WebSocket server and specify the handler for new connections.
    server = await websockets.serve(
        partial(
            on_connect, command_name=args.command, delay=args.delay, period=args.period
        ),
        "127.0.0.1",  # Listen on loopback.
        9000,  # Port number.
        subprotocols=["ocpp2.0", "ocpp2.0.1"],  # Specify OCPP 2.0.1 subprotocols.
    )
    logging.info("WebSocket Server Started")

    # Wait for the server to close (runs indefinitely).
    await server.wait_closed()


# Entry point of the script.
if __name__ == "__main__":
    # Run the main function to start the server.
    asyncio.run(main())
