#!/usr/bin/env python3
"""Ad-hoc HTTP test tool for UI-server phase P17.17 (fix #2037).

Phase verified
--------------
P17.17 -- the (deprecated) UI HTTP server MUST defer a broadcast/fan-out
command's HTTP response until the aggregated per-station outcome is available,
instead of synthesizing an immediate/premature success. See
``src/charging-station/ui-server/UIHttpServer.ts`` (``handleRequestBody``:
"A null response is a deferred broadcast: keep the request open so the later
aggregated ``sendResponse`` writes the real per-station outcome").

Protocol discovered (sources)
-----------------------------
- Transport: plain HTTP ``POST`` (``UIHttpServer.requestListener`` rejects any
  non-POST method).
- Request URL: ``/<protocol>/<version>/<procedureName>`` -> ``/ui/0.0.1/<command>``
  (parsed in ``requestListener``; ``Protocol.UI`` = ``'ui'`` and
  ``ProtocolVersion['0.0.1']`` in ``src/types/UIProtocol.ts``).
- Request body: JSON object = the procedure PDU (e.g. ``{}``; ``hashIds``
  defaults to all charging stations).
- Response body: JSON ``ResponsePayload`` with ``status`` ('success'|'failure')
  and, for fan-out commands, the aggregated per-station fields
  ``hashIdsSucceeded`` / ``hashIdsFailed`` / ``responsesFailed``
  (``AbstractUIService``). HTTP status: 200 on success, 400 on failure
  (``responseStatusToStatusCode``).
- Synchronous procedures (e.g. ``listChargingStations``) respond inline; the
  response carries ``chargingStations`` where each entry exposes
  ``stationInfo.hashId`` (``ChargingStationData`` in
  ``src/types/ChargingStationWorker.ts``).

Test logic
----------
1. POST the synchronous ``listChargingStations`` to enumerate the known station
   hashIds (set ``S``) and confirm connectivity.
2. POST the broadcast ``--command`` (default: startChargingStation) and measure
   the elapsed time and the returned payload.
3. Inspect the aggregated per-station coverage of the broadcast response.

The discriminator between the fixed (deferred/aggregated) and the buggy
(premature/partial) behaviour is response CONTENT: a deferred broadcast response
accounts for every known station (full aggregation), whereas a synthesized
immediate success carries no per-station aggregation and cannot cover ``S``.

PASS / FAIL
-----------
PASS (exit 0): at least one station exists, the broadcast response carries
    aggregated per-station fields, and the accounted stations
    (``hashIdsSucceeded`` u ``hashIdsFailed`` u ``responsesFailed[].hashId``)
    cover the full known set ``S`` -- proving the response waited for the
    complete worker aggregation (not premature, not partial).
FAIL (exit 1): no charging stations exist (cannot verify aggregation), the
    broadcast response carried no per-station aggregation (premature/synthesized
    success or a non-broadcast command), the accounted set did not cover ``S``
    (partial aggregation), or a transport/decode error occurred.
"""

from __future__ import annotations

import argparse
import asyncio
import gzip
import json
import sys
import urllib.error
import urllib.request
from dataclasses import dataclass
from http.client import HTTPMessage
from time import perf_counter
from typing import Any

UI_PROTOCOL_PATH = "ui/0.0.1"
SYNC_ENUMERATION_PROCEDURE = "listChargingStations"

EXIT_PASS = 0
EXIT_FAIL = 1


@dataclass(frozen=True)
class HttpResult:
    """Outcome of a single UI-server HTTP POST."""

    status_code: int
    payload: dict[str, Any]
    elapsed_seconds: float


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "P17.17 (#2037): verify the UI HTTP server defers a broadcast "
            "command's response until the aggregated worker outcome."
        )
    )
    parser.add_argument(
        "--url",
        default="http://localhost:8080",
        help="UI server base HTTP URL (default: http://localhost:8080).",
    )
    parser.add_argument(
        "--command",
        default="startChargingStation",
        help=(
            "Broadcast/fan-out procedure name to POST (default: "
            "startChargingStation). Must be a fan-out command for the "
            "aggregation property to hold."
        ),
    )
    parser.add_argument(
        "--timeout",
        type=float,
        default=30.0,
        help="Per-request HTTP timeout in seconds (default: 30).",
    )
    return parser.parse_args()


def _post(
    base_url: str, procedure: str, payload: dict[str, Any], timeout: float
) -> HttpResult:
    """POST a UI-server SRPC-over-HTTP request and return the decoded result."""
    url = f"{base_url.rstrip('/')}/{UI_PROTOCOL_PATH}/{procedure}"
    body = json.dumps(payload).encode()
    request = urllib.request.Request(  # noqa: S310 - fixed http(s) UI-server URL
        url,
        data=body,
        method="POST",
        headers={"Content-Type": "application/json"},
    )
    start = perf_counter()
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:  # noqa: S310
            raw = response.read()
            status_code = response.status
            headers = response.headers
    except urllib.error.HTTPError as error:
        # A failure ResponsePayload is returned with HTTP 400 and a JSON body.
        raw = error.read()
        status_code = error.code
        headers = error.headers
    elapsed = perf_counter() - start

    payload = _decode_json_object(raw, headers, procedure, status_code)
    return HttpResult(status_code=status_code, payload=payload, elapsed_seconds=elapsed)


def _decode_json_object(
    raw: bytes, headers: HTTPMessage, procedure: str, status_code: int
) -> dict[str, Any]:
    """Decode a UI-server HTTP response body into a JSON object.

    Transparently decompresses a ``Content-Encoding: gzip`` body (the UI HTTP
    server compresses payloads above a threshold when the client advertises
    gzip), then parses the JSON object. Non-JSON bodies (e.g. the plain-text
    ``404 Not Found`` a non-``http`` UI server transport returns for the
    ``/ui/<version>/<procedure>`` path) raise a ``ValueError`` with an
    actionable diagnostic instead of a cryptic ``json`` decode error.
    """
    content_encoding = (headers.get("Content-Encoding") or "").strip().lower()
    if content_encoding == "gzip":
        try:
            raw = gzip.decompress(raw)
        except (EOFError, OSError) as error:
            raise ValueError(
                f"'{procedure}' response advertised Content-Encoding: gzip but "
                f"could not be decompressed (HTTP {status_code}): {error}"
            ) from error
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError as error:
        raise ValueError(
            f"'{procedure}' response body is not valid UTF-8 "
            f"(HTTP {status_code}): {error}"
        ) from error
    try:
        decoded = json.loads(text)
    except json.JSONDecodeError as error:
        content_type = headers.get("Content-Type") or "unknown"
        preview = text.strip()[:200]
        raise ValueError(
            f"'{procedure}' returned a non-JSON response (HTTP {status_code}, "
            f"Content-Type: {content_type}): {error}. Body preview: {preview!r}. "
            "Hint: this tool targets the deprecated UI HTTP server; verify "
            "'uiServer.type' is 'http' (a 'ws'/'mcp' transport replies with a "
            "plain-text 404 on this path)."
        ) from error
    if not isinstance(decoded, dict):
        raise ValueError(f"Unexpected non-object response payload from '{procedure}'")
    return decoded


def _station_hash_ids(payload: dict[str, Any]) -> set[str]:
    """Extract the set of station hashIds from a listChargingStations payload."""
    stations = payload.get("chargingStations")
    hash_ids: set[str] = set()
    if isinstance(stations, list):
        for station in stations:
            if not isinstance(station, dict):
                continue
            station_info = station.get("stationInfo")
            if isinstance(station_info, dict):
                hash_id = station_info.get("hashId")
                if isinstance(hash_id, str):
                    hash_ids.add(hash_id)
    return hash_ids


def _accounted_hash_ids(payload: dict[str, Any]) -> set[str]:
    """Union of per-station hashIds accounted for in an aggregated response."""
    accounted: set[str] = set()
    for key in ("hashIdsSucceeded", "hashIdsFailed"):
        value = payload.get(key)
        if isinstance(value, list):
            accounted.update(item for item in value if isinstance(item, str))
    responses_failed = payload.get("responsesFailed")
    if isinstance(responses_failed, list):
        for entry in responses_failed:
            if isinstance(entry, dict):
                hash_id = entry.get("hashId")
                if isinstance(hash_id, str):
                    accounted.add(hash_id)
    return accounted


def _has_aggregation_fields(payload: dict[str, Any]) -> bool:
    return any(
        key in payload
        for key in ("hashIdsSucceeded", "hashIdsFailed", "responsesFailed")
    )


async def _run(args: argparse.Namespace) -> int:
    try:
        enumeration = await asyncio.to_thread(
            _post, args.url, SYNC_ENUMERATION_PROCEDURE, {}, args.timeout
        )
        known_stations = _station_hash_ids(enumeration.payload)

        broadcast = await asyncio.to_thread(
            _post, args.url, args.command, {}, args.timeout
        )
    except (OSError, urllib.error.URLError) as error:
        print(f"FAIL: HTTP transport error: {error}", file=sys.stderr)
        return EXIT_FAIL
    except (ValueError, json.JSONDecodeError) as error:
        print(f"FAIL: could not decode UI-server response: {error}", file=sys.stderr)
        return EXIT_FAIL

    accounted = _accounted_hash_ids(broadcast.payload)

    print(f"Base URL            : {args.url}")
    print(f"Broadcast command   : {args.command}")
    print(f"Enumeration latency : {enumeration.elapsed_seconds * 1000:.1f} ms")
    print(f"Broadcast latency   : {broadcast.elapsed_seconds * 1000:.1f} ms")
    print(f"Broadcast HTTP code : {broadcast.status_code}")
    print(f"Broadcast status    : {broadcast.payload.get('status')}")
    print(f"Known stations      : {len(known_stations)}")
    print(f"Accounted stations  : {len(accounted)}")

    if not known_stations:
        print(
            "FAIL: no charging stations exist; the aggregation property cannot "
            "be verified. Add and start stations before running this tool.",
            file=sys.stderr,
        )
        return EXIT_FAIL

    if not _has_aggregation_fields(broadcast.payload):
        print(
            "FAIL: broadcast response carried no per-station aggregation fields "
            "(premature/synthesized success, or a non-broadcast command was used).",
            file=sys.stderr,
        )
        return EXIT_FAIL

    missing = known_stations - accounted
    if missing:
        print(
            f"FAIL: partial aggregation -- {len(missing)} known station(s) not "
            "accounted for in the broadcast response (response arrived before "
            "full worker aggregation).",
            file=sys.stderr,
        )
        return EXIT_FAIL

    print(
        "PASS: broadcast HTTP response was deferred until the complete worker "
        "aggregation covering all known stations (no premature/partial response)."
    )
    return EXIT_PASS


def main() -> int:
    args = _parse_args()
    try:
        return asyncio.run(_run(args))
    except KeyboardInterrupt:
        return EXIT_FAIL


if __name__ == "__main__":
    sys.exit(main())
