# OCPP2 Mock Server

This project includes a mock Open Charge Point Protocol (OCPP) version 2.0.1 server implemented in Python.

## Prerequisites

This project requires Python 3.7+ and the following Python packages:

- `websockets`
- `ocpp`

You can install these packages using pip:
```
pip install websockets ocpp
```

## Running the Server

To start the server, run the `server.py` script:

```
python server.py
```

The server will start listening for connections on port 9000.

## Overview of the Server Scripts

### Server.py

The server script waits for connections from clients. When a client connects, the server creates a new instance of the `ChargePoint` class. This class includes methods for handling various OCPP actions (`BootNotification`,`GetBaseReport`), most of which return a dummy response. The `GetBaseReport` method prints the received request and returns a simple confirmation message.

The server script uses the websockets and ocpp libraries to facilitate the WebSocket and OCPP communication.

## Note

Primarily, this software is intended for testing applications. The server scripts don't execute full OCPP adherence and it is advised not to use them in a production environment without additional development.

For reference:
https://github.com/mobilityhouse/ocpp
