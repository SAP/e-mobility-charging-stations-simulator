"""OCPP 1.6 mock server for e-mobility charging station simulator testing."""

import argparse
import asyncio
import contextlib
import logging
import sys
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from enum import StrEnum
from functools import partial
from random import randint
from typing import ClassVar

import ocpp.v16
import websockets
from ocpp.exceptions import InternalError, OCPPError
from ocpp.routing import on
from ocpp.v16.enums import (
    Action,
    AuthorizationStatus,
    AvailabilityStatus,
    AvailabilityType,
    CancelReservationStatus,
    DataTransferStatus,
    MessageTrigger,
    RegistrationStatus,
    RemoteStartStopStatus,
    ReservationStatus,
    ResetStatus,
    ResetType,
    TriggerMessageStatus,
    ValueFormat,
)
from websockets import ConnectionClosed

from _common import (
    DEFAULT_BLACKLIST,
    DEFAULT_WHITELIST,
    check_positive_number,
    install_signal_handlers_and_wait,
    negotiate_subprotocol,
    parse_commands,
)
from timer import Timer

logger = logging.getLogger(__name__)

# Server defaults
DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 9000
DEFAULT_HEARTBEAT_INTERVAL_SECONDS = 60
DEFAULT_CONNECTOR_ID = 1
DEFAULT_TEST_TOKEN = "test_token"  # noqa: S105
DEFAULT_FIRMWARE_URL = "https://example.com/firmware/v1.6.bin"
DEFAULT_DIAGNOSTICS_URL = "https://example.com/diagnostics"
DEFAULT_RESERVE_CONNECTOR_ID = 1
DEFAULT_RESERVE_ID_TAG = "reserved_tag"
DEFAULT_RESERVATION_ID = 1
DEFAULT_RESERVATION_EXPIRY_SECONDS = 3600
FALLBACK_TRANSACTION_ID = 1
MAX_TRANSACTION_ID = 2**31 - 1
SHUTDOWN_TIMEOUT_SECONDS = 30.0
SUBPROTOCOLS: list[websockets.Subprotocol] = [
    websockets.Subprotocol("ocpp1.6"),
]


def _log_signed_meter_values(meter_value: list) -> None:
    """Log signed meter value details from a list of OCPP 1.6 meter value dicts.

    In OCPP 1.6 a signed reading is carried by a SampledValue whose ``format``
    is ``SignedData`` (the ``value`` field then holds the signed blob). This is
    used to exercise the P6C.5 signed meter value test case.
    """
    for mv in meter_value:
        for sv in mv.get("sampled_value", []):
            if sv.get("format") == ValueFormat.signed_data.value:
                logger.info(
                    "Received signed meter value (SignedData):"
                    " measurand=%s, context=%s, value=%s",
                    sv.get("measurand"),
                    sv.get("context"),
                    sv.get("value"),
                )


def _random_transaction_id() -> int:
    """Generate a random OCPP 1.6 transaction ID within the valid range."""
    return randint(1, MAX_TRANSACTION_ID)  # noqa: S311


class AuthMode(StrEnum):
    """Authorization modes for testing different authentication scenarios."""

    normal = "normal"
    whitelist = "whitelist"
    blacklist = "blacklist"


@dataclass(frozen=True)
class AuthConfig:
    """Authorization configuration for a charge point."""

    mode: AuthMode
    whitelist: tuple[str, ...]
    blacklist: tuple[str, ...]
    offline: bool
    default_status: AuthorizationStatus
    parent_id_tag: str | None = None


@dataclass(frozen=True)
class ServerConfig:
    """Server-level configuration passed to each connection handler."""

    command_name: Action | None
    delay: float | None
    period: float | None
    auth_config: AuthConfig
    boot_sequence: tuple[RegistrationStatus, ...]
    connector_id: int
    # Intentionally mutable despite frozen dataclass
    charge_points: set["ChargePoint"]
    # Shared mutable counter so boot_sequence advances across reconnections.
    # NOTE: on_connect passes this same list to every ChargePoint, so the boot
    # index is shared across ALL stations on this server, not per-station: the
    # Nth BootNotification server-wide gets the Nth boot_sequence status.
    boot_index: list[int] = field(default_factory=lambda: [0])
    commands: list[tuple[Action, float]] | None = None
    trigger_message_type: MessageTrigger = MessageTrigger.status_notification
    reset_type: ResetType = ResetType.hard
    availability_type: AvailabilityType = AvailabilityType.operative
    reserve_connector_id: int = DEFAULT_RESERVE_CONNECTOR_ID
    reserve_id_tag: str = DEFAULT_RESERVE_ID_TAG
    reservation_id: int = DEFAULT_RESERVATION_ID


class ChargePoint(ocpp.v16.ChargePoint):
    """OCPP 1.6 charge point handler with configurable behavior for testing."""

    _command_timer: Timer | None
    _commands_task: asyncio.Task[None] | None
    _auth_config: AuthConfig
    _boot_sequence: tuple[RegistrationStatus, ...]
    _boot_index: list[int]
    _connector_id: int
    _trigger_message_type: MessageTrigger
    _reset_type: ResetType
    _availability_type: AvailabilityType
    _reserve_connector_id: int
    _reserve_id_tag: str
    _reservation_id: int
    _charge_points: set["ChargePoint"]
    _active_transactions: dict[int, int]

    def __init__(
        self,
        connection,
        auth_config: AuthConfig | None = None,
        boot_sequence: tuple[RegistrationStatus, ...] = (RegistrationStatus.accepted,),
        boot_index: list[int] | None = None,
        connector_id: int = DEFAULT_CONNECTOR_ID,
        trigger_message_type: MessageTrigger = MessageTrigger.status_notification,
        reset_type: ResetType = ResetType.hard,
        availability_type: AvailabilityType = AvailabilityType.operative,
        reserve_connector_id: int = DEFAULT_RESERVE_CONNECTOR_ID,
        reserve_id_tag: str = DEFAULT_RESERVE_ID_TAG,
        reservation_id: int = DEFAULT_RESERVATION_ID,
        charge_points: set["ChargePoint"] | None = None,
    ):
        # Extract CP ID from last URL segment (OCPP 1.6 uses ws://host/<cpId>)
        cp_id = connection.request.path.strip("/").split("/")[-1]
        if cp_id == "":
            logger.warning(
                "Empty CP ID extracted from path: %s", connection.request.path
            )
        super().__init__(cp_id, connection)
        self._charge_points = charge_points if charge_points is not None else set()
        self._command_timer = None
        self._commands_task = None
        self._boot_sequence = boot_sequence
        if not self._boot_sequence:
            raise ValueError("boot_sequence must contain at least one status")
        self._boot_index = boot_index if boot_index is not None else [0]
        self._connector_id = connector_id
        self._trigger_message_type = trigger_message_type
        self._reset_type = reset_type
        self._availability_type = availability_type
        self._reserve_connector_id = reserve_connector_id
        self._reserve_id_tag = reserve_id_tag
        self._reservation_id = reservation_id
        self._charge_points.add(self)
        self._active_transactions = {}
        if auth_config is None:
            self._auth_config = AuthConfig(
                mode=AuthMode.normal,
                whitelist=DEFAULT_WHITELIST,
                blacklist=DEFAULT_BLACKLIST,
                offline=False,
                default_status=AuthorizationStatus.accepted,
            )
        else:
            self._auth_config = auth_config

    def _resolve_auth_status(self, id_tag: str) -> AuthorizationStatus:
        """Resolve authorization status based on auth mode and id tag."""
        match self._auth_config.mode:
            case AuthMode.whitelist:
                return (
                    AuthorizationStatus.accepted
                    if id_tag in self._auth_config.whitelist
                    else AuthorizationStatus.blocked
                )
            case AuthMode.blacklist:
                return (
                    AuthorizationStatus.blocked
                    if id_tag in self._auth_config.blacklist
                    else AuthorizationStatus.accepted
                )
        return self._auth_config.default_status

    def _build_id_tag_info(self, id_tag: str) -> dict:
        """Build id_tag_info dict with optional parentIdTag."""
        id_tag_info: dict = {"status": self._resolve_auth_status(id_tag)}
        if self._auth_config.parent_id_tag is not None:
            id_tag_info["parent_id_tag"] = self._auth_config.parent_id_tag
        return id_tag_info

    def _get_active_or_fallback_transaction_id(self) -> int:
        """Return the first active transaction ID, or fall back to a test ID."""
        transaction_id = next(iter(self._active_transactions), None)
        if transaction_id is None:
            logger.warning("No active transaction found, using fallback ID")
            transaction_id = FALLBACK_TRANSACTION_ID
        return transaction_id

    # --- Incoming message handlers (CS → CSMS) ---

    @on(Action.boot_notification)
    async def on_boot_notification(
        self, charge_point_model, charge_point_vendor, **kwargs
    ):
        logger.info(
            "Received %s from model=%s vendor=%s",
            Action.boot_notification,
            charge_point_model,
            charge_point_vendor,
        )
        idx = self._boot_index[0]
        status = self._boot_sequence[min(idx, len(self._boot_sequence) - 1)]
        self._boot_index[0] = idx + 1
        return ocpp.v16.call_result.BootNotification(
            current_time=datetime.now(timezone.utc).isoformat(),
            interval=DEFAULT_HEARTBEAT_INTERVAL_SECONDS,
            status=status,
        )

    @on(Action.heartbeat)
    async def on_heartbeat(self, **kwargs):
        logger.info("Received %s", Action.heartbeat)
        return ocpp.v16.call_result.Heartbeat(
            current_time=datetime.now(timezone.utc).isoformat()
        )

    @on(Action.authorize)
    async def on_authorize(self, id_tag, **kwargs):
        logger.info("Received %s for id_tag: %s", Action.authorize, id_tag)
        if self._auth_config.offline:
            logger.warning("Offline mode - simulating network failure")
            raise InternalError(description="Simulated network failure")
        id_tag_info = self._build_id_tag_info(id_tag)
        logger.info("Authorization status for %s: %s", id_tag, id_tag_info["status"])
        return ocpp.v16.call_result.Authorize(id_tag_info=id_tag_info)

    @on(Action.start_transaction)
    async def on_start_transaction(
        self, connector_id: int, id_tag: str, meter_start: int, timestamp, **kwargs
    ):
        logger.info(
            "Received %s on connector %s for id_tag %s (meter_start=%s)",
            Action.start_transaction,
            connector_id,
            id_tag,
            meter_start,
        )
        id_tag_info = self._build_id_tag_info(id_tag)
        transaction_id = _random_transaction_id()
        self._active_transactions[transaction_id] = connector_id
        logger.info(
            "Started transaction %s (auth status %s)",
            transaction_id,
            id_tag_info["status"],
        )
        return ocpp.v16.call_result.StartTransaction(
            transaction_id=transaction_id, id_tag_info=id_tag_info
        )

    @on(Action.stop_transaction)
    async def on_stop_transaction(
        self, meter_stop: int, timestamp, transaction_id: int, **kwargs
    ):
        logger.info(
            "Received %s for transaction %s (meter_stop=%s, reason=%s)",
            Action.stop_transaction,
            transaction_id,
            meter_stop,
            kwargs.get("reason"),
        )
        self._active_transactions.pop(transaction_id, None)
        transaction_data = kwargs.get("transaction_data")
        if transaction_data is not None:
            _log_signed_meter_values(transaction_data)
        id_tag = kwargs.get("id_tag")
        if id_tag is not None:
            return ocpp.v16.call_result.StopTransaction(
                id_tag_info=self._build_id_tag_info(id_tag)
            )
        return ocpp.v16.call_result.StopTransaction()

    @on(Action.meter_values)
    async def on_meter_values(self, connector_id, meter_value, **kwargs):
        logger.info(
            "Received %s on connector %s (transaction_id=%s)",
            Action.meter_values,
            connector_id,
            kwargs.get("transaction_id"),
        )
        _log_signed_meter_values(meter_value)
        return ocpp.v16.call_result.MeterValues()

    @on(Action.status_notification)
    async def on_status_notification(
        self, connector_id: int, error_code: str, status: str, **kwargs
    ):
        logger.info(
            "Received %s on connector %s: status=%s, error_code=%s",
            Action.status_notification,
            connector_id,
            status,
            error_code,
        )
        return ocpp.v16.call_result.StatusNotification()

    @on(Action.data_transfer)
    async def on_data_transfer(self, vendor_id, **kwargs):
        logger.info(
            "Received %s from vendor %s (message_id=%s)",
            Action.data_transfer,
            vendor_id,
            kwargs.get("message_id"),
        )
        return ocpp.v16.call_result.DataTransfer(status=DataTransferStatus.accepted)

    @on(Action.firmware_status_notification)
    async def on_firmware_status_notification(self, status, **kwargs):
        logger.info(
            "Received %s: status=%s", Action.firmware_status_notification, status
        )
        return ocpp.v16.call_result.FirmwareStatusNotification()

    @on(Action.diagnostics_status_notification)
    async def on_diagnostics_status_notification(self, status, **kwargs):
        logger.info(
            "Received %s: status=%s", Action.diagnostics_status_notification, status
        )
        return ocpp.v16.call_result.DiagnosticsStatusNotification()

    # --- Outgoing commands (CSMS → CS) ---

    async def _call_and_log(self, request, action: Action, success_status) -> None:
        """Send an OCPP request and log success or failure based on its status."""
        response = await self.call(request, suppress=False)
        if response.status == success_status:
            logger.info("%s successful", action)
        else:
            logger.info("%s failed: %s", action, response.status)

    async def _send_trigger_message(self):
        request = ocpp.v16.call.TriggerMessage(
            requested_message=self._trigger_message_type,
            connector_id=self._connector_id,
        )
        await self._call_and_log(
            request, Action.trigger_message, TriggerMessageStatus.accepted
        )

    async def _send_remote_start_transaction(self):
        request = ocpp.v16.call.RemoteStartTransaction(
            id_tag=DEFAULT_TEST_TOKEN, connector_id=self._connector_id
        )
        await self._call_and_log(
            request, Action.remote_start_transaction, RemoteStartStopStatus.accepted
        )

    async def _send_remote_stop_transaction(self):
        request = ocpp.v16.call.RemoteStopTransaction(
            transaction_id=self._get_active_or_fallback_transaction_id()
        )
        await self._call_and_log(
            request, Action.remote_stop_transaction, RemoteStartStopStatus.accepted
        )

    async def _send_reset(self):
        request = ocpp.v16.call.Reset(type=self._reset_type)
        await self._call_and_log(request, Action.reset, ResetStatus.accepted)

    async def _send_change_availability(self):
        request = ocpp.v16.call.ChangeAvailability(
            connector_id=self._connector_id, type=self._availability_type
        )
        await self._call_and_log(
            request, Action.change_availability, AvailabilityStatus.accepted
        )

    async def _send_update_firmware(self):
        request = ocpp.v16.call.UpdateFirmware(
            location=DEFAULT_FIRMWARE_URL,
            retrieve_date=datetime.now(timezone.utc).isoformat(),
        )
        await self.call(request, suppress=False)
        logger.info("%s response received", Action.update_firmware)

    async def _send_get_diagnostics(self):
        request = ocpp.v16.call.GetDiagnostics(location=DEFAULT_DIAGNOSTICS_URL)
        response = await self.call(request, suppress=False)
        logger.info(
            "%s response received: file_name=%s",
            Action.get_diagnostics,
            response.file_name,
        )

    async def _send_reserve_now(self):
        expiry_date = (
            datetime.now(timezone.utc)
            + timedelta(seconds=DEFAULT_RESERVATION_EXPIRY_SECONDS)
        ).isoformat()
        request = ocpp.v16.call.ReserveNow(
            connector_id=self._reserve_connector_id,
            expiry_date=expiry_date,
            id_tag=self._reserve_id_tag,
            reservation_id=self._reservation_id,
        )
        await self._call_and_log(
            request, Action.reserve_now, ReservationStatus.accepted
        )

    async def _send_cancel_reservation(self):
        request = ocpp.v16.call.CancelReservation(reservation_id=self._reservation_id)
        await self._call_and_log(
            request, Action.cancel_reservation, CancelReservationStatus.accepted
        )

    # --- Command dispatch ---

    # Intentional subset of CSMS→CS commands supported by this mock.
    # Any Action absent from this map is handled by _send_command via
    # logger.warning only — no request is sent and no error is raised.
    _COMMAND_HANDLERS: ClassVar[dict[Action, str]] = {
        Action.trigger_message: "_send_trigger_message",
        Action.remote_start_transaction: "_send_remote_start_transaction",
        Action.remote_stop_transaction: "_send_remote_stop_transaction",
        Action.reset: "_send_reset",
        Action.change_availability: "_send_change_availability",
        Action.update_firmware: "_send_update_firmware",
        Action.get_diagnostics: "_send_get_diagnostics",
        Action.reserve_now: "_send_reserve_now",
        Action.cancel_reservation: "_send_cancel_reservation",
    }

    async def _send_command(self, command_name: Action):
        logger.debug("Sending OCPP command %s", command_name)
        try:
            handler_name = self._COMMAND_HANDLERS.get(command_name)
            if handler_name is not None:
                await getattr(self, handler_name)()
            else:
                logger.warning("Not supported command %s", command_name)
        except TimeoutError:
            logger.error("Timeout waiting for %s response", command_name)
        except OCPPError as e:
            logger.error(
                "OCPP error sending %s: [%s] %s",
                command_name,
                type(e).__name__,
                e.description,
            )
        except ConnectionClosed:
            logger.warning("Connection closed while sending %s", command_name)
            self.handle_connection_closed()
        except Exception:
            logger.exception("Unexpected error sending %s", command_name)

    async def send_command(
        self, command_name: Action, delay: float | None, period: float | None
    ):
        try:
            if delay and not self._command_timer:
                self._command_timer = Timer(
                    delay,
                    False,
                    self._send_command,
                    (command_name,),
                )
            if period and not self._command_timer:
                self._command_timer = Timer(
                    period,
                    True,
                    self._send_command,
                    (command_name,),
                )
        except ConnectionClosed:
            self.handle_connection_closed()

    async def send_commands(self, commands: list[tuple[Action, float]]) -> None:
        for command_name, delay in commands:
            await asyncio.sleep(delay)
            await self._send_command(command_name)

    def handle_connection_closed(self) -> None:
        logger.info("ChargePoint %s closed connection", self.id)
        if self._command_timer:
            self._command_timer.cancel()
        if self._commands_task:
            self._commands_task.cancel()
        self._charge_points.discard(self)
        logger.debug("Connected ChargePoint(s): %d", len(self._charge_points))


async def on_connect(
    websocket,
    config: ServerConfig,
):
    """Handle new WebSocket connections from charge points."""
    if not await negotiate_subprotocol(websocket, logger):
        return

    charge_points: set[ChargePoint] = config.charge_points
    cp = ChargePoint(
        websocket,
        auth_config=config.auth_config,
        boot_sequence=config.boot_sequence,
        boot_index=config.boot_index,
        connector_id=config.connector_id,
        trigger_message_type=config.trigger_message_type,
        reset_type=config.reset_type,
        availability_type=config.availability_type,
        reserve_connector_id=config.reserve_connector_id,
        reserve_id_tag=config.reserve_id_tag,
        reservation_id=config.reservation_id,
        charge_points=charge_points,
    )
    if config.command_name:
        await cp.send_command(config.command_name, config.delay, config.period)
    elif config.commands:
        # send_commands() begins with asyncio.sleep(delay) which yields to
        # cp.start() below. All delays are validated > 0 by _parse_commands.
        cp._commands_task = asyncio.create_task(cp.send_commands(config.commands))

    try:
        await cp.start()
    except ConnectionClosed:
        cp.handle_connection_closed()


def _parse_commands(commands_str: str) -> list[tuple[Action, float]]:
    return parse_commands(commands_str, Action)


async def main():
    parser = argparse.ArgumentParser(description="OCPP 1.6 Server")
    command_group = parser.add_mutually_exclusive_group()
    command_group.add_argument("-c", "--command", type=Action, help="command name")
    command_group.add_argument(
        "--commands",
        type=str,
        default=None,
        help=(
            'comma-separated command sequence: "CMD1:DELAY1,CMD2:DELAY2,..."'
            ' (e.g., "RemoteStartTransaction:5,RemoteStopTransaction:30")'
        ),
    )
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

    # Server configuration
    parser.add_argument(
        "--host",
        type=str,
        default=DEFAULT_HOST,
        help=f"server host (default: {DEFAULT_HOST})",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=DEFAULT_PORT,
        help=f"server port (default: {DEFAULT_PORT})",
    )
    parser.add_argument(
        "--connector-id",
        type=int,
        default=DEFAULT_CONNECTOR_ID,
        help=(
            f"connector id used in CSMS→CS commands (default: {DEFAULT_CONNECTOR_ID})"
        ),
    )

    # Boot behavior
    boot_group = parser.add_mutually_exclusive_group()
    boot_group.add_argument(
        "--boot-status",
        type=RegistrationStatus,
        default=None,
        help=(
            "boot notification response status"
            " (Accepted, Pending, Rejected; default: Accepted)"
        ),
    )
    boot_group.add_argument(
        "--boot-status-sequence",
        type=str,
        default=None,
        help=(
            "comma-separated boot notification status sequence"
            " (e.g. Pending,Pending,Accepted)"
        ),
    )

    # Command-specific options
    parser.add_argument(
        "--trigger-message",
        type=MessageTrigger,
        default=MessageTrigger.status_notification,
        help="TriggerMessage requested_message type (default: StatusNotification)",
    )
    parser.add_argument(
        "--reset-type",
        type=ResetType,
        default=ResetType.hard,
        help="Reset type: Hard, Soft (default: Hard)",
    )
    parser.add_argument(
        "--availability-type",
        type=AvailabilityType,
        default=AvailabilityType.operative,
        help="ChangeAvailability type: Operative, Inoperative (default: Operative)",
    )
    parser.add_argument(
        "--reserve-connector-id",
        type=int,
        default=DEFAULT_RESERVE_CONNECTOR_ID,
        help=(f"ReserveNow connector id (default: {DEFAULT_RESERVE_CONNECTOR_ID})"),
    )
    parser.add_argument(
        "--reserve-id-tag",
        type=str,
        default=DEFAULT_RESERVE_ID_TAG,
        help=(
            "ReserveNow id tag reserving the connector"
            f" (default: {DEFAULT_RESERVE_ID_TAG})"
        ),
    )
    parser.add_argument(
        "--reservation-id",
        type=int,
        default=DEFAULT_RESERVATION_ID,
        help=(
            "ReserveNow/CancelReservation reservation id"
            f" (default: {DEFAULT_RESERVATION_ID})"
        ),
    )

    # Auth configuration
    parser.add_argument(
        "--auth-mode",
        type=AuthMode,
        default=AuthMode.normal,
        help="Authorization mode: normal, whitelist, blacklist (default: normal)",
    )
    parser.add_argument(
        "--whitelist",
        type=str,
        nargs="+",
        default=list(DEFAULT_WHITELIST),
        help="Whitelist of authorized id tags (space-separated)",
    )
    parser.add_argument(
        "--blacklist",
        type=str,
        nargs="+",
        default=list(DEFAULT_BLACKLIST),
        help="Blacklist of blocked id tags (space-separated)",
    )
    parser.add_argument(
        "--offline",
        action="store_true",
        help="Simulate offline/network failure mode",
    )
    parser.add_argument(
        "--auth-parent-id-tag",
        type=str,
        default=None,
        help="parentIdTag value to include in Authorize/StartTransaction responses",
    )

    args, _ = parser.parse_known_args()
    group.required = args.command is not None

    args = parser.parse_args()

    try:
        parsed_commands = _parse_commands(args.commands) if args.commands else None
        if parsed_commands is not None and not parsed_commands:
            parser.error("--commands must contain at least one CMD:DELAY entry")
    except argparse.ArgumentTypeError as e:
        parser.error(str(e))

    if args.boot_status_sequence is not None:
        boot_sequence_items: list[RegistrationStatus] = []
        for raw_value in args.boot_status_sequence.split(","):
            value = raw_value.strip()
            try:
                status = RegistrationStatus(value)
            except ValueError:
                valid = ", ".join(e.value for e in RegistrationStatus)
                parser.error(
                    f"invalid value for --boot-status-sequence: {value!r}."
                    f" Valid values are: {valid}"
                )
            boot_sequence_items.append(status)
        boot_sequence = tuple(boot_sequence_items)
    elif args.boot_status is not None:
        boot_sequence = (args.boot_status,)
    else:
        boot_sequence = (RegistrationStatus.accepted,)

    auth_config = AuthConfig(
        mode=args.auth_mode,
        whitelist=tuple(args.whitelist),
        blacklist=tuple(args.blacklist),
        offline=args.offline,
        default_status=AuthorizationStatus.accepted,
        parent_id_tag=args.auth_parent_id_tag,
    )

    config = ServerConfig(
        command_name=args.command,
        delay=args.delay,
        period=args.period,
        auth_config=auth_config,
        boot_sequence=boot_sequence,
        connector_id=args.connector_id,
        boot_index=[0],
        charge_points=set(),
        commands=parsed_commands,
        trigger_message_type=args.trigger_message,
        reset_type=args.reset_type,
        availability_type=args.availability_type,
        reserve_connector_id=args.reserve_connector_id,
        reserve_id_tag=args.reserve_id_tag,
        reservation_id=args.reservation_id,
    )

    logger.info(
        "Auth configuration: mode=%s, offline=%s",
        auth_config.mode,
        auth_config.offline,
    )

    loop = asyncio.get_running_loop()
    shutdown_event = asyncio.Event()

    async with websockets.serve(
        partial(
            on_connect,
            config=config,
        ),
        args.host,
        args.port,
        subprotocols=SUBPROTOCOLS,
    ) as server:
        logger.info("WebSocket Server Started on %s:%d", args.host, args.port)
        await install_signal_handlers_and_wait(
            loop, server, shutdown_event, SHUTDOWN_TIMEOUT_SECONDS, logger
        )

    logger.info("Server shutdown complete")


if __name__ == "__main__":
    logging.basicConfig(level=logging.DEBUG)
    with contextlib.suppress(KeyboardInterrupt):
        asyncio.run(main())
    sys.exit(0)
