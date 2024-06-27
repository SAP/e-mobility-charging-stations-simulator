import argparse
import asyncio
import logging
from datetime import datetime, timezone
from functools import partial
from typing import Optional

import ocpp.v201
import websockets
from ocpp.routing import on
from ocpp.v201.enums import (
    Action,
    AuthorizationStatusType,
    ClearCacheStatusType,
    GenericDeviceModelStatusType,
    RegistrationStatusType,
    ReportBaseType,
    TransactionEventType,
)
from websockets import ConnectionClosed

from timer import Timer

# Setting up the logging configuration to display debug level messages.
logging.basicConfig(level=logging.DEBUG)

ChargePoints = set()


# Define a ChargePoint class inheriting from the OCPP 2.0.1 ChargePoint class.
class ChargePoint(ocpp.v201.ChargePoint):
    _command_timer: Optional[Timer]

    def __init__(self, connection):
        super().__init__(connection.path.strip("/"), connection)
        self._command_timer = None

    # Message handlers to receive OCPP messages.
    @on(Action.BootNotification)
    async def on_boot_notification(self, charging_station, reason, **kwargs):
        logging.info("Received %s", Action.BootNotification)
        # Create and return a BootNotification response with the current time,
        # an interval of 60 seconds, and an accepted status.
        return ocpp.v201.call_result.BootNotification(
            current_time=datetime.now(timezone.utc).isoformat(),
            interval=60,
            status=RegistrationStatusType.accepted,
        )

    @on(Action.Heartbeat)
    async def on_heartbeat(self, **kwargs):
        logging.info("Received %s", Action.Heartbeat)
        return ocpp.v201.call_result.Heartbeat(
            current_time=datetime.now(timezone.utc).isoformat()
        )

    @on(Action.StatusNotification)
    async def on_status_notification(
        self, timestamp, evse_id: int, connector_id: int, connector_status, **kwargs
    ):
        logging.info("Received %s", Action.StatusNotification)
        return ocpp.v201.call_result.StatusNotification()

    @on(Action.Authorize)
    async def on_authorize(self, id_token, **kwargs):
        logging.info("Received %s", Action.Authorize)
        return ocpp.v201.call_result.Authorize(
            id_token_info={"status": AuthorizationStatusType.accepted}
        )

    @on(Action.TransactionEvent)
    async def on_transaction_event(
        self,
        event_type: TransactionEventType,
        timestamp,
        trigger_reason,
        seq_no: int,
        transaction_info,
        **kwargs,
    ):
        match event_type:
            case TransactionEventType.started:
                logging.info("Received %s Started", Action.TransactionEvent)
                return ocpp.v201.call_result.TransactionEvent(
                    id_token_info={"status": AuthorizationStatusType.accepted}
                )
            case TransactionEventType.updated:
                logging.info("Received %s Updated", Action.TransactionEvent)
                return ocpp.v201.call_result.TransactionEvent(total_cost=10)
            case TransactionEventType.ended:
                logging.info("Received %s Ended", Action.TransactionEvent)
                return ocpp.v201.call_result.TransactionEvent()

    @on(Action.MeterValues)
    async def on_meter_values(self, evse_id: int, meter_value, **kwargs):
        logging.info("Received %s", Action.MeterValues)
        return ocpp.v201.call_result.MeterValues()

    # Request handlers to emit OCPP messages.
    async def _send_clear_cache(self):
        request = ocpp.v201.call.ClearCache()
        response = await self.call(request)

        if response.status == ClearCacheStatusType.accepted:
            logging.info("%s successful", Action.ClearCache)
        else:
            logging.info("%s failed", Action.ClearCache)

    async def _send_get_base_report(self):
        request = ocpp.v201.call.GetBaseReport(
            request_id=1, report_base=ReportBaseType.full_inventory
        )
        response = await self.call(request)

        if response.status == GenericDeviceModelStatusType.accepted:
            logging.info("%s successful", Action.GetBaseReport)
        else:
            logging.info("%s failed", Action.GetBaseReport)

    async def _send_command(self, command_name: Action):
        logging.debug("Sending OCPP command %s", command_name)
        match command_name:
            case Action.ClearCache:
                await self._send_clear_cache()
            case Action.GetBaseReport:
                await self._send_get_base_report()
            case _:
                logging.info(f"Not supported command {command_name}")

    async def send_command(
        self, command_name: Action, delay: Optional[float], period: Optional[float]
    ):
        if not delay and not period:
            raise ValueError("Either delay or period must be defined")
        if delay and delay <= 0:
            raise ValueError("Delay must be a positive number")
        if period and period <= 0:
            raise ValueError("Period must be a positive number")
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


# Main function to start the WebSocket server.
async def main():
    parser = argparse.ArgumentParser(description="OCPP2 Server")
    parser.add_argument("-c", "--command", type=Action, help="OCPP2 Command Name")
    parser.add_argument("-d", "--delay", type=float, help="Delay in seconds")
    parser.add_argument("-p", "--period", type=float, help="Period in seconds")

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
