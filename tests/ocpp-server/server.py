import argparse
import asyncio
import logging
from datetime import datetime, timezone
from functools import partial
from threading import Timer

import ocpp.v201
import websockets
from ocpp.routing import on
from ocpp.v201.enums import (
    Action,
    AuthorizationStatusType,
    ClearCacheStatusType,
    RegistrationStatusType,
    ReportBaseType,
    TransactionEventType,
)
from websockets import ConnectionClosed

# Setting up the logging configuration to display debug level messages.
logging.basicConfig(level=logging.DEBUG)

ChargePoints = set()


class RepeatTimer(Timer):
    """Class that inherits from the Timer class. It will run a
    function at regular intervals."""

    def run(self):
        while not self.finished.wait(self.interval):
            self.function(*self.args, **self.kwargs)


# Define a ChargePoint class inheriting from the OCPP 2.0.1 ChargePoint class.
class ChargePoint(ocpp.v201.ChargePoint):
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

    @on(Action.GetBaseReport)
    async def on_get_base_report(
        self, request_id: int, report_base: ReportBaseType, **kwargs
    ):
        logging.info("Received %s", Action.GetBaseReport)
        return ocpp.v201.call_result.GetBaseReport(
            id_token_info={"status": ReportBaseType.accepted}
        )

    # Request handlers to emit OCPP messages.
    async def send_clear_cache(self):
        request = ocpp.v201.call.ClearCache()
        response = await self.call(request)

        if response.status == ClearCacheStatusType.accepted:
            logging.info("%s successful", Action.ClearCache)
        else:
            logging.info("%s failed", Action.ClearCache)

    async def send_get_base_report(self):
        request = ocpp.v201.call.GetBaseReport(
            reportBase=ReportBaseType.ConfigurationInventory
        )  # Use correct ReportBaseType
        try:
            response = await self.call(request)
            logging.info("Send %s", Action.GetBaseReport)

            if response.status == ReportBaseType.accepted:
                logging.info("%s successful", Action.GetBaseReport)
            else:
                logging.info("%s failed", Action.GetBaseReport)

        except ConnectionClosed as e:
            logging.error("Connection closed: %s", str(e))

        except Exception as e:
            logging.error("Unexpected error occurred: %s", str(e))

        logging.info("send_get_base_report done.")


# Function to send OCPP command
async def send_ocpp_command(cp, command_name, delay=None, period=None):
    # If delay is not None, sleep for delay seconds
    if delay:
        await asyncio.sleep(delay)

    # If period is not None, send command repeatedly with period interval
    if period:

        async def send_command_repeatedly():
            while True:
                command_name = await cp.receive_command()
                try:
                    match command_name:
                        case Action.ClearCache:
                            logging.info("ClearCache parser working")
                            await cp.send_clear_cache()
                        case Action.GetBaseReport:
                            logging.info("GetBaseReport parser working")
                            await cp.send_get_base_report()
                        case _:
                            logging.warning(f"Unsupported command {command_name}")
                except Exception:
                    logging.exception(
                        f"Failure while processing command {command_name}"
                    )
                finally:
                    await asyncio.sleep(period)

        timer = RepeatTimer(period, send_command_repeatedly)
        await timer.start()
        await timer.wait_closed()  # Wait for timer to finish before exiting

    else:
        if command_name == "GetBaseReport":
            await cp.send_get_base_report()


# Function to handle new WebSocket connections.
async def on_connect(websocket, path, args):
    """For every new charge point that connects, create a ChargePoint instance and start
    listening for messages."""
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

    charge_point_id = path.strip("/")
    cp = ChargePoint(charge_point_id, websocket)

    ChargePoints.add(cp)
    try:
        await cp.start()
        # Check if request argument is specified
        if args.request:
            asyncio.create_task(
                send_ocpp_command(cp, args.request, args.delay, args.period)
            )

    except ConnectionClosed:
        logging.info("ChargePoint %s closed connection", cp.id)
        ChargePoints.remove(cp)
        logging.debug("Connected ChargePoint(s): %d", len(ChargePoints))


# Main function to start the WebSocket server.
async def main():
    # Define argument parser
    parser = argparse.ArgumentParser(description="OCPP Charge Point Simulator")
    parser.add_argument("--request", type=str, help="OCPP 2 Command Name")
    parser.add_argument("--delay", type=int, help="Delay in seconds")
    parser.add_argument("--period", type=int, help="Period in seconds")

    args = parser.parse_args()

    on_connect_bound = partial(on_connect, args=args)  # Add args to on_connect

    # Create the WebSocket server and specify the handler for new connections.
    server = await websockets.serve(
        on_connect_bound,
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
