import asyncio
import logging
import websockets
from datetime import datetime, timezone

from ocpp.routing import on
from ocpp.v201 import ChargePoint as cp
from ocpp.v201 import call_result
from ocpp.v201.enums import RegistrationStatusType, GenericDeviceModelStatusType

# Setting up the logging configuration to display debug level messages.
logging.basicConfig(level=logging.DEBUG)

# Define a ChargePoint class inheriting from the OCPP 2.0.1 ChargePoint class.
class ChargePoint(cp):
    # Define a handler for the BootNotification message.
    @on('BootNotification')
    async def on_boot_notification(self, charging_station, reason, **kwargs):
        logging.info("Received BootNotification")
        # Create and return a BootNotification response with the current time,
        # an interval of 10 seconds, and an accepted status.
        return call_result.BootNotification(
            current_time = datetime.now(timezone.utc).isoformat(),
            interval=10,
            status=RegistrationStatusType.accepted
        )

    # Define a handler for the GetBaseReport message.
    @on('GetBaseReport')
    async def on_get_base_report(self, request_id, report_base, **kwargs):
        try:
            logging.info(f"Received GetBaseReport request with RequestId: {request_id} and ReportBase: {report_base}")

            # Create a mock response for demonstration purposes, indicating the report is accepted.
            response = call_result.GetBaseReport(
                status=GenericDeviceModelStatusType.accepted
            )

            logging.info(f"Sending GetBaseReport response: {response}")
            return response
        except Exception as e:
            # Log any errors that occur while handling the GetBaseReport request.
            logging.error(f"Error handling GetBaseReport request: {e}", exc_info=True)
            # Return a rejected status in case of error.
            return call_result.GetBaseReport(
                status=GenericDeviceModelStatusType.rejected
            )

# Function to handle new WebSocket connections.
async def on_connect(websocket, path):
    """ For every new charge point that connects, create a ChargePoint instance and start listening for messages. """
    try:
        requested_protocols = websocket.request_headers['Sec-WebSocket-Protocol']
    except KeyError:
        logging.info("Client hasn't requested any Subprotocol. Closing Connection")
        return await websocket.close()

    if websocket.subprotocol:
        logging.info("Protocols Matched: %s", websocket.subprotocol)
    else:
        logging.warning('Protocols Mismatched | Expected Subprotocols: %s,'
                        ' but client supports %s | Closing connection',
                        websocket.available_subprotocols,
                        requested_protocols)
        return await websocket.close()

    charge_point_id = path.strip('/')
    cp = ChargePoint(charge_point_id, websocket)

    # Start the ChargePoint instance to listen for incoming messages.
    await cp.start()

# Main function to start the WebSocket server.
async def main():
    # Create the WebSocket server and specify the handler for new connections.
    server = await websockets.serve(
        on_connect,
        '0.0.0.0',  # Listen on loopback.
        9000,       # Port number.
        subprotocols=['ocpp2.0', 'ocpp2.0.1']  # Specify OCPP 2.0.1 subprotocols.
    )
    logging.info("WebSocket Server Started")
    # Wait for the server to close (runs indefinitely).
    await server.wait_closed()

# Entry point of the script.
if __name__ == '__main__':
    # Run the main function to start the server.
    asyncio.run(main())
