"""OCPP-version-agnostic helpers shared by the 1.6 and 2.0.1 mock servers."""

import argparse
import asyncio
import logging
import math
import signal
import sys
from enum import StrEnum
from typing import TypeVar

ActionT = TypeVar("ActionT", bound=StrEnum)

DEFAULT_WHITELIST: tuple[str, ...] = ("valid_token", "test_token", "authorized_user")
DEFAULT_BLACKLIST: tuple[str, ...] = ("blocked_token", "invalid_user")


def check_positive_number(value: str) -> float:
    try:
        number = float(value)
    except ValueError:
        raise argparse.ArgumentTypeError("must be a number") from None
    if not math.isfinite(number):
        raise argparse.ArgumentTypeError("must be a finite number")
    if number <= 0:
        raise argparse.ArgumentTypeError("must be a positive number")
    return number


def parse_commands(
    commands_str: str, action_type: type[ActionT]
) -> list[tuple[ActionT, float]]:
    result: list[tuple[ActionT, float]] = []
    for raw_entry in commands_str.split(","):
        entry = raw_entry.strip()
        if not entry:
            continue
        if ":" not in entry:
            raise argparse.ArgumentTypeError(
                f"Invalid command entry '{entry}': expected 'CMD:DELAY' format"
            )
        cmd_str, delay_str = entry.split(":", 1)
        try:
            cmd = action_type(cmd_str.strip())
        except ValueError:
            raise argparse.ArgumentTypeError(
                f"Unknown action: '{cmd_str.strip()}'"
            ) from None
        try:
            delay = float(delay_str.strip())
        except ValueError:
            raise argparse.ArgumentTypeError(
                f"Invalid delay '{delay_str.strip()}': must be a number"
            ) from None
        if not math.isfinite(delay) or delay <= 0:
            raise argparse.ArgumentTypeError(
                f"Delay must be a finite positive number, got {delay}"
            )
        result.append((cmd, delay))
    return result


async def negotiate_subprotocol(websocket, logger: logging.Logger) -> bool:
    try:
        requested_protocols = websocket.request.headers["Sec-WebSocket-Protocol"]
    except KeyError:
        logger.info("Client hasn't requested any Subprotocol. Closing Connection")
        await websocket.close()
        return False

    if websocket.subprotocol:
        logger.info("Protocols Matched: %s", websocket.subprotocol)
        return True

    logger.warning(
        "Protocols Mismatched | Expected Subprotocols: %s,"
        " but client supports %s | Closing connection",
        websocket.available_subprotocols,
        requested_protocols,
    )
    await websocket.close()
    return False


async def install_signal_handlers_and_wait(
    loop: asyncio.AbstractEventLoop,
    server,
    shutdown_event: asyncio.Event,
    shutdown_timeout: float,
    logger: logging.Logger,
) -> None:
    shutdown_count = 0

    def _on_signal(sig: signal.Signals) -> None:
        nonlocal shutdown_count
        shutdown_count += 1
        if shutdown_count == 1:
            logger.info("Received %s, initiating graceful shutdown...", sig.name)
            server.close()
            shutdown_event.set()
        else:
            logger.warning("Received %s again, forcing exit", sig.name)
            # Unix convention: fatal-signal exit status is 128 + signal number.
            sys.exit(128 + sig.value)

    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, _on_signal, sig)
        except NotImplementedError:
            # Windows: ProactorEventLoop doesn't support add_signal_handler.
            # signal.signal() fires outside the event loop, so schedule
            # _on_signal into the loop via call_soon_threadsafe.
            def _signal_handler(
                _signum: int,
                _frame: object,
                s: signal.Signals = sig,
            ) -> None:
                loop.call_soon_threadsafe(_on_signal, s)

            signal.signal(sig, _signal_handler)

    await shutdown_event.wait()

    try:
        async with asyncio.timeout(shutdown_timeout):
            await server.wait_closed()
    except TimeoutError:
        logger.warning(
            "Shutdown timed out after %.0fs — connections may not have closed cleanly",
            shutdown_timeout,
        )
