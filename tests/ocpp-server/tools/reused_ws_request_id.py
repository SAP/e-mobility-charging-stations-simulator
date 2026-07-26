#!/usr/bin/env python3
"""Ad-hoc WebSocket test tool for UI-server phase P17.15 (fix #2033).

Phase verified
--------------
P17.15 -- the UI WebSocket server MUST reject a *still-in-flight* duplicate
request id instead of overwriting the prior request's response handler. See
``src/charging-station/ui-server/UIWebSocketServer.ts`` (``rejectInFlightRequestId``,
guarded by ``if (this.hasResponseHandler(requestId))``).

Protocol discovered (sources)
-----------------------------
- SRPC over WebSocket, subprotocol header ``Sec-WebSocket-Protocol: ui0.0.1``
  (``Protocol.UI`` = ``'ui'`` + ``ProtocolVersion['0.0.1']`` in
  ``src/types/UIProtocol.ts``; enforced in ``UIWebSocketServer.attachTransport``).
- Request frame  : ``[uuid, procedureName, payload]`` (3-element array).
  ``uuid`` MUST be a valid UUID (``validateUUID`` in ``validateRawDataRequest``);
  it doubles as the SRPC messageId used to correlate the response.
- Response frame : ``[uuid, payload]`` (2-element array,
  ``AbstractUIServer.buildProtocolResponse``).
- In-flight duplicate rejection: the server answers the duplicate on the same
  socket with ``{ "status": "failure", "errorMessage": "UI protocol request id
  '<uuid>' is already in-flight" }`` while the first request keeps its handler
  and resolves normally (``UIWebSocketServer.rejectInFlightRequestId``,
  lines ~310-340).

Test logic
----------
Open one WebSocket connection, then emit ``--count`` (default 2) request frames
that all share the SAME ``uuid`` as a tight burst, WITHOUT reading any response
in between, so the duplicates reach the server while the first request is still
in-flight. Compression is disabled (``compression=None``) so the server's ws
receiver processes the burst synchronously (no async inflate splitting the
frames across event-loop turns), which keeps the first request in-flight when
the duplicates are dispatched.

PASS / FAIL
-----------
PASS (exit 0): at least one response is the in-flight duplicate rejection
    (``errorMessage`` contains "in-flight") AND at least one response is a
    normal, non-rejection response (the first request resolving). For the
    default ``--count 2`` this means exactly one rejection + one normal reply.
FAIL (exit 1): no in-flight rejection was observed (duplicate not rejected / no
    overlap achieved), no normal response was observed, a connection/transport
    error occurred, or fewer responses than expected arrived before the
    deadline.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
import uuid as uuid_module
from typing import Any

import websockets

UI_SUBPROTOCOL = "ui0.0.1"
IN_FLIGHT_MARKER = "in-flight"

EXIT_PASS = 0
EXIT_FAIL = 1


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "P17.15 (#2033): verify the UI WebSocket server rejects a reused "
            "in-flight request id while the original request resolves normally."
        )
    )
    parser.add_argument(
        "--url",
        default="ws://localhost:8080",
        help="UI server WebSocket URL (default: ws://localhost:8080).",
    )
    parser.add_argument(
        "--procedure",
        default="listChargingStations",
        help="SRPC procedure name to invoke (default: listChargingStations).",
    )
    parser.add_argument(
        "--count",
        type=int,
        default=2,
        help="Number of identical-id frames to burst (default: 2, minimum: 2).",
    )
    parser.add_argument(
        "--timeout",
        type=float,
        default=15.0,
        help="Overall deadline in seconds to collect responses (default: 15).",
    )
    return parser.parse_args()


def _is_rejection(payload: dict[str, Any]) -> bool:
    """Return True when the payload is the in-flight duplicate rejection."""
    if payload.get("status") != "failure":
        return False
    error_message = payload.get("errorMessage")
    return isinstance(error_message, str) and IN_FLIGHT_MARKER in error_message.lower()


def _decode_response(raw: str | bytes) -> dict[str, Any] | None:
    """Decode a ``[uuid, payload]`` SRPC response frame into its payload."""
    text = raw.decode() if isinstance(raw, bytes) else raw
    try:
        frame = json.loads(text)
    except json.JSONDecodeError:
        return None
    if not isinstance(frame, list) or len(frame) != 2:
        return None
    payload = frame[1]
    if not isinstance(payload, dict):
        return None
    return payload


async def _collect_responses(
    ws: websockets.ClientConnection, expected: int, deadline: float
) -> list[dict[str, Any]]:
    """Collect up to ``expected`` response payloads, bounded by ``deadline``."""
    loop = asyncio.get_running_loop()
    payloads: list[dict[str, Any]] = []
    end_at = loop.time() + deadline
    while len(payloads) < expected:
        remaining = end_at - loop.time()
        if remaining <= 0:
            break
        try:
            raw = await asyncio.wait_for(ws.recv(), timeout=remaining)
        except TimeoutError:
            break
        except websockets.ConnectionClosed:
            break
        payload = _decode_response(raw)
        if payload is not None:
            payloads.append(payload)
    return payloads


async def _run(args: argparse.Namespace) -> int:
    count = max(2, args.count)
    request_id = str(uuid_module.uuid4())
    frame = json.dumps([request_id, args.procedure, {}])

    try:
        async with websockets.connect(
            args.url,
            subprotocols=[websockets.Subprotocol(UI_SUBPROTOCOL)],
            compression=None,
        ) as ws:
            # Burst the identical-id frames in the same event-loop turn so the
            # duplicates arrive while the first request is still in-flight.
            await asyncio.gather(*(ws.send(frame) for _ in range(count)))
            payloads = await _collect_responses(ws, count, args.timeout)
    except (OSError, websockets.WebSocketException) as error:
        print(f"FAIL: WebSocket transport error: {error}", file=sys.stderr)
        return EXIT_FAIL

    rejections = [p for p in payloads if _is_rejection(p)]
    normals = [p for p in payloads if not _is_rejection(p)]

    print(f"Reused request id : {request_id}")
    print(f"Procedure         : {args.procedure}")
    print(f"Frames sent       : {count}")
    print(f"Responses received: {len(payloads)}")
    print(f"In-flight rejections: {len(rejections)}")
    print(f"Normal responses    : {len(normals)}")

    if rejections and normals:
        print(
            "PASS: reused in-flight request id was rejected while the original "
            "request resolved normally."
        )
        return EXIT_PASS

    if not rejections:
        print(
            "FAIL: no in-flight duplicate rejection observed (duplicate id was "
            "not rejected, or no in-flight overlap was achieved -- retry with a "
            "broadcast --procedure that stays in-flight, e.g. startChargingStation).",
            file=sys.stderr,
        )
    else:
        print(
            "FAIL: no normal (non-rejection) response observed; the original "
            "request did not resolve.",
            file=sys.stderr,
        )
    return EXIT_FAIL


def main() -> int:
    args = _parse_args()
    try:
        return asyncio.run(_run(args))
    except KeyboardInterrupt:
        return EXIT_FAIL


if __name__ == "__main__":
    sys.exit(main())
