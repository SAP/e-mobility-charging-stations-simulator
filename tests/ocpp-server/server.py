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
    ClearCacheStatusEnumType,
    GenericDeviceModelStatusEnumType,
    RegistrationStatusEnumType,
    ReportBaseEnumType,
    TransactionEventEnumType,
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

    async def _send_command(self, command_name: Action):
        logging.debug("Sending OCPP command %s", command_name)
        match command_name:
            case Action.clear_cache:
                await self._send_clear_cache()
            case Action.get_base_report:
                await self._send_get_base_report()
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
