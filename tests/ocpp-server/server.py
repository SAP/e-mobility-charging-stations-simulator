"""OCPP 2.0.1 mock server for e-mobility charging station simulator testing."""

import argparse
import asyncio
import logging
import math
import signal
import sys
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from enum import StrEnum
from functools import partial
from random import randint

import ocpp.v201
import websockets
from ocpp.exceptions import InternalError, OCPPError
from ocpp.routing import on
from ocpp.v201.enums import (
    Action,
    AuthorizationStatusEnumType,
    CertificateSignedStatusEnumType,
    CertificateSigningUseEnumType,
    ChangeAvailabilityStatusEnumType,
    ClearCacheStatusEnumType,
    CustomerInformationStatusEnumType,
    DataTransferStatusEnumType,
    DeleteCertificateStatusEnumType,
    GenericDeviceModelStatusEnumType,
    GenericStatusEnumType,
    GetCertificateIdUseEnumType,
    GetCertificateStatusEnumType,
    GetInstalledCertificateStatusEnumType,
    InstallCertificateStatusEnumType,
    InstallCertificateUseEnumType,
    Iso15118EVCertificateStatusEnumType,
    LogEnumType,
    LogStatusEnumType,
    MessageTriggerEnumType,
    OperationalStatusEnumType,
    RegistrationStatusEnumType,
    ReportBaseEnumType,
    ResetEnumType,
    ResetStatusEnumType,
    SetNetworkProfileStatusEnumType,
    TransactionEventEnumType,
    TriggerMessageStatusEnumType,
    UnlockStatusEnumType,
    UpdateFirmwareStatusEnumType,
)
from websockets import ConnectionClosed

from timer import Timer

logger = logging.getLogger(__name__)

# Server defaults
DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 9000
DEFAULT_HEARTBEAT_INTERVAL = 60
DEFAULT_TOTAL_COST = 10.0
MAX_REQUEST_ID = 2**31 - 1
SHUTDOWN_TIMEOUT = 30.0
SUBPROTOCOLS: list[websockets.Subprotocol] = [
    websockets.Subprotocol("ocpp2.0"),
    websockets.Subprotocol("ocpp2.0.1"),
]


def _random_request_id() -> int:
    """Generate a random OCPP request ID within the valid range."""
    return randint(1, MAX_REQUEST_ID)  # noqa: S311


class AuthMode(StrEnum):
    """Authorization modes for testing different authentication scenarios."""

    normal = "normal"
    whitelist = "whitelist"
    blacklist = "blacklist"
    rate_limit = "rate_limit"
    offline = "offline"


@dataclass(frozen=True)
class AuthConfig:
    """Authorization configuration for a charge point."""

    mode: AuthMode
    whitelist: tuple[str, ...]
    blacklist: tuple[str, ...]
    offline: bool
    default_status: AuthorizationStatusEnumType
    auth_group_id: str | None = None
    auth_cache_expiry: int | None = None


@dataclass(frozen=True)
class ServerConfig:
    """Server-level configuration passed to each connection handler."""

    command_name: Action | None
    delay: float | None
    period: float | None
    auth_config: AuthConfig
    boot_sequence: tuple[RegistrationStatusEnumType, ...]
    total_cost: float
    # Intentionally mutable despite frozen dataclass
    charge_points: set["ChargePoint"]
    commands: list[tuple[Action, float]] | None = None
    trigger_message_type: MessageTriggerEnumType = (
        MessageTriggerEnumType.status_notification
    )
    reset_type: ResetEnumType = ResetEnumType.immediate
    availability_status: OperationalStatusEnumType = OperationalStatusEnumType.operative
    set_variables_data: list[dict] | None = None
    get_variables_data: list[dict] | None = None


class ChargePoint(ocpp.v201.ChargePoint):
    """OCPP 2.0.1 charge point handler with configurable behavior for testing."""

    _command_timer: Timer | None
    _auth_config: AuthConfig
    _boot_sequence: tuple[RegistrationStatusEnumType, ...]
    _boot_index: int
    _total_cost: float
    _trigger_message_type: MessageTriggerEnumType
    _reset_type: ResetEnumType
    _availability_status: OperationalStatusEnumType
    _charge_points: set["ChargePoint"]
    _set_variables_data: list[dict] | None
    _get_variables_data: list[dict] | None

    def __init__(
        self,
        connection,
        auth_config: AuthConfig | None = None,
        boot_sequence: tuple[RegistrationStatusEnumType, ...] = (
            RegistrationStatusEnumType.accepted,
        ),
        total_cost: float = DEFAULT_TOTAL_COST,
        trigger_message_type: MessageTriggerEnumType = (
            MessageTriggerEnumType.status_notification
        ),
        reset_type: ResetEnumType = ResetEnumType.immediate,
        availability_status: OperationalStatusEnumType = (
            OperationalStatusEnumType.operative
        ),
        charge_points: set["ChargePoint"] | None = None,
        set_variables_data: list[dict] | None = None,
        get_variables_data: list[dict] | None = None,
    ):
        # Extract CP ID from last URL segment (OCPP 2.0.1 Part 4)
        cp_id = connection.request.path.strip("/").split("/")[-1]
        if cp_id == "":
            logger.warning(
                "Empty CP ID extracted from path: %s", connection.request.path
            )
        super().__init__(cp_id, connection)
        self._charge_points = charge_points if charge_points is not None else set()
        self._command_timer = None
        self._boot_sequence = boot_sequence
        self._boot_index = 0
        self._total_cost = total_cost
        self._trigger_message_type = trigger_message_type
        self._reset_type = reset_type
        self._availability_status = availability_status
        self._set_variables_data = set_variables_data
        self._get_variables_data = get_variables_data
        self._charge_points.add(self)
        self._active_transactions: dict[str, int] = {}
        if auth_config is None:
            self._auth_config = AuthConfig(
                mode=AuthMode.normal,
                whitelist=("valid_token", "test_token", "authorized_user"),
                blacklist=("blocked_token", "invalid_user"),
                offline=False,
                default_status=AuthorizationStatusEnumType.accepted,
            )
        else:
            self._auth_config = auth_config

    def _resolve_auth_status(self, token_id: str) -> AuthorizationStatusEnumType:
        """Resolve authorization status based on auth mode and token."""
        match self._auth_config.mode:
            case AuthMode.whitelist:
                return (
                    AuthorizationStatusEnumType.accepted
                    if token_id in self._auth_config.whitelist
                    else AuthorizationStatusEnumType.blocked
                )
            case AuthMode.blacklist:
                return (
                    AuthorizationStatusEnumType.blocked
                    if token_id in self._auth_config.blacklist
                    else AuthorizationStatusEnumType.accepted
                )
            case AuthMode.rate_limit:
                return AuthorizationStatusEnumType.not_at_this_time
            case _:
                return self._auth_config.default_status

    def _build_id_token_info(self, token_id: str) -> dict:
        """Build id_token_info dict with optional groupIdToken and cacheExpiry."""
        status = self._resolve_auth_status(token_id)
        id_token_info: dict = {"status": status}
        if self._auth_config.auth_group_id is not None:
            id_token_info["group_id_token"] = {
                "id_token": self._auth_config.auth_group_id,
                "type": "Central",
            }
        if self._auth_config.auth_cache_expiry is not None:
            expiry = datetime.now(timezone.utc) + timedelta(
                seconds=self._auth_config.auth_cache_expiry
            )
            id_token_info["cache_expiry_date_time"] = expiry.isoformat()
        return id_token_info

    # --- Incoming message handlers (CS → CSMS) ---

    @on(Action.boot_notification)
    async def on_boot_notification(self, charging_station, reason, **kwargs):
        logger.info("Received %s", Action.boot_notification)
        status = self._boot_sequence[
            min(self._boot_index, len(self._boot_sequence) - 1)
        ]
        self._boot_index += 1
        return ocpp.v201.call_result.BootNotification(
            current_time=datetime.now(timezone.utc).isoformat(),
            interval=DEFAULT_HEARTBEAT_INTERVAL,
            status=status,
        )

    @on(Action.heartbeat)
    async def on_heartbeat(self, **kwargs):
        logger.info("Received %s", Action.heartbeat)
        return ocpp.v201.call_result.Heartbeat(
            current_time=datetime.now(timezone.utc).isoformat()
        )

    @on(Action.status_notification)
    async def on_status_notification(
        self, timestamp, evse_id: int, connector_id: int, connector_status, **kwargs
    ):
        logger.info("Received %s", Action.status_notification)
        return ocpp.v201.call_result.StatusNotification()

    @on(Action.authorize)
    async def on_authorize(self, id_token, **kwargs):
        logger.info(
            "Received %s for token: %s", Action.authorize, id_token.get("id_token")
        )

        if self._auth_config.offline:
            logger.warning("Offline mode - simulating network failure")
            raise InternalError(description="Simulated network failure")

        token_id = id_token.get("id_token", "")
        id_token_info = self._build_id_token_info(token_id)

        logger.info(
            "Authorization status for %s: %s", token_id, id_token_info["status"]
        )
        return ocpp.v201.call_result.Authorize(id_token_info=id_token_info)

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
                logger.info("Received %s Started", Action.transaction_event)

                transaction_id = transaction_info.get("transaction_id", "")
                evse_id = kwargs.get("evse", {}).get("id", 0)
                self._active_transactions[transaction_id] = evse_id

                id_token = kwargs.get("id_token", {})
                token_id = id_token.get("id_token", "")
                id_token_info = self._build_id_token_info(token_id)

                logger.info(
                    "Transaction start auth status for %s: %s",
                    token_id,
                    id_token_info["status"],
                )
                return ocpp.v201.call_result.TransactionEvent(
                    id_token_info=id_token_info
                )
            case TransactionEventEnumType.updated:
                logger.info("Received %s Updated", Action.transaction_event)
                return ocpp.v201.call_result.TransactionEvent(
                    total_cost=self._total_cost
                )
            case TransactionEventEnumType.ended:
                logger.info("Received %s Ended", Action.transaction_event)
                transaction_id = transaction_info.get("transaction_id", "")
                self._active_transactions.pop(transaction_id, None)
                return ocpp.v201.call_result.TransactionEvent()
            case _:
                logger.warning("Unknown transaction event type: %s", event_type)
                return ocpp.v201.call_result.TransactionEvent()

    @on(Action.meter_values)
    async def on_meter_values(self, evse_id: int, meter_value, **kwargs):
        logger.info("Received %s", Action.meter_values)
        return ocpp.v201.call_result.MeterValues()

    @on(Action.notify_report)
    async def on_notify_report(
        self, request_id: int, generated_at, seq_no: int, **kwargs
    ):
        logger.info("Received %s", Action.notify_report)
        return ocpp.v201.call_result.NotifyReport()

    @on(Action.data_transfer)
    async def on_data_transfer(self, vendor_id: str, **kwargs):
        logger.info("Received %s", Action.data_transfer)
        return ocpp.v201.call_result.DataTransfer(
            status=DataTransferStatusEnumType.accepted
        )

    @on(Action.firmware_status_notification)
    async def on_firmware_status_notification(self, status, **kwargs):
        logger.info("Received %s", Action.firmware_status_notification)
        return ocpp.v201.call_result.FirmwareStatusNotification()

    @on(Action.log_status_notification)
    async def on_log_status_notification(self, status, request_id: int, **kwargs):
        logger.info("Received %s", Action.log_status_notification)
        return ocpp.v201.call_result.LogStatusNotification()

    @on(Action.security_event_notification)
    async def on_security_event_notification(self, **kwargs):
        logger.info("Received %s", Action.security_event_notification)
        return ocpp.v201.call_result.SecurityEventNotification()

    @on(Action.get_15118_ev_certificate)
    async def on_get_15118_ev_certificate(
        self, iso15118_schema_version, action, exi_request, **kwargs
    ):
        logger.info("Received %s", Action.get_15118_ev_certificate)
        return ocpp.v201.call_result.Get15118EVCertificate(
            status=Iso15118EVCertificateStatusEnumType.accepted,
            exi_response="mock_exi_response_data",
        )

    @on(Action.get_certificate_status)
    async def on_get_certificate_status(self, ocsp_request_data, **kwargs):
        logger.info("Received %s", Action.get_certificate_status)
        return ocpp.v201.call_result.GetCertificateStatus(
            status=GetCertificateStatusEnumType.accepted,
        )

    @on(Action.sign_certificate)
    async def on_sign_certificate(self, csr, **kwargs):
        logger.info("Received %s", Action.sign_certificate)
        return ocpp.v201.call_result.SignCertificate(
            status=GenericStatusEnumType.accepted,
        )

    @on(Action.notify_customer_information)
    async def on_notify_customer_information(
        self, data, seq_no: int, generated_at, request_id: int, **kwargs
    ):
        logger.info("Received %s", Action.notify_customer_information)
        return ocpp.v201.call_result.NotifyCustomerInformation()

    # --- Outgoing commands (CSMS → CS) ---

    async def _call_and_log(self, request, action: Action, success_status) -> None:
        """Send an OCPP request and log success or failure."""
        response = await self.call(request, suppress=False)
        if response.status == success_status:
            logger.info("%s successful", action)
        else:
            logger.info("%s failed", action)

    async def _send_clear_cache(self):
        request = ocpp.v201.call.ClearCache()
        await self._call_and_log(
            request, Action.clear_cache, ClearCacheStatusEnumType.accepted
        )

    async def _send_get_base_report(self):
        request = ocpp.v201.call.GetBaseReport(
            request_id=_random_request_id(),
            report_base=ReportBaseEnumType.full_inventory,
        )
        await self._call_and_log(
            request, Action.get_base_report, GenericDeviceModelStatusEnumType.accepted
        )

    async def _send_get_variables(self):
        data = (
            self._get_variables_data
            if self._get_variables_data is not None
            else [
                {
                    "component": {"name": "ChargingStation"},
                    "variable": {"name": "AvailabilityState"},
                }
            ]
        )
        request = ocpp.v201.call.GetVariables(get_variable_data=data)
        await self.call(request, suppress=False)
        logger.info("%s response received", Action.get_variables)

    async def _send_set_variables(self):
        data = (
            self._set_variables_data
            if self._set_variables_data is not None
            else [
                {
                    "component": {"name": "OCPPCommCtrlr"},
                    "variable": {"name": "HeartbeatInterval"},
                    "attribute_value": "30",
                }
            ]
        )
        request = ocpp.v201.call.SetVariables(set_variable_data=data)
        await self.call(request, suppress=False)
        logger.info("%s response received", Action.set_variables)

    async def _send_request_start_transaction(self):
        request = ocpp.v201.call.RequestStartTransaction(
            id_token={"id_token": "test_token", "type": "ISO14443"},
            evse_id=1,
            remote_start_id=_random_request_id(),
        )
        await self.call(request, suppress=False)
        logger.info("%s response received", Action.request_start_transaction)

    async def _send_request_stop_transaction(self):
        transaction_id = next(iter(self._active_transactions), "")
        if not transaction_id:
            logger.warning("No active transaction found, using fallback ID")
            transaction_id = "test_transaction_123"
        request = ocpp.v201.call.RequestStopTransaction(transaction_id=transaction_id)
        await self.call(request, suppress=False)
        logger.info("%s response received", Action.request_stop_transaction)

    async def _send_reset(self):
        request = ocpp.v201.call.Reset(type=self._reset_type)
        await self._call_and_log(request, Action.reset, ResetStatusEnumType.accepted)

    async def _send_unlock_connector(self):
        request = ocpp.v201.call.UnlockConnector(evse_id=1, connector_id=1)
        await self._call_and_log(
            request, Action.unlock_connector, UnlockStatusEnumType.unlocked
        )

    async def _send_change_availability(self):
        request = ocpp.v201.call.ChangeAvailability(
            operational_status=self._availability_status
        )
        await self._call_and_log(
            request,
            Action.change_availability,
            ChangeAvailabilityStatusEnumType.accepted,
        )

    async def _send_trigger_message(self):
        request = ocpp.v201.call.TriggerMessage(
            requested_message=self._trigger_message_type
        )
        await self._call_and_log(
            request, Action.trigger_message, TriggerMessageStatusEnumType.accepted
        )

    async def _send_data_transfer(self):
        request = ocpp.v201.call.DataTransfer(
            vendor_id="TestVendor", message_id="TestMessage", data="test_data"
        )
        await self._call_and_log(
            request, Action.data_transfer, DataTransferStatusEnumType.accepted
        )

    async def _send_certificate_signed(self):
        request = ocpp.v201.call.CertificateSigned(
            certificate_chain=(
                "-----BEGIN CERTIFICATE-----\n"
                "MIIBkTCB+wIUMockCertificateForTesting=\n"
                "-----END CERTIFICATE-----"
            ),
            certificate_type=CertificateSigningUseEnumType.charging_station_certificate,
        )
        await self._call_and_log(
            request,
            Action.certificate_signed,
            CertificateSignedStatusEnumType.accepted,
        )

    async def _send_customer_information(self):
        request = ocpp.v201.call.CustomerInformation(
            request_id=_random_request_id(),
            report=True,
            clear=False,
            customer_identifier="test_customer_001",
        )
        await self._call_and_log(
            request,
            Action.customer_information,
            CustomerInformationStatusEnumType.accepted,
        )

    async def _send_delete_certificate(self):
        request = ocpp.v201.call.DeleteCertificate(
            certificate_hash_data={
                "hash_algorithm": "SHA256",
                "issuer_name_hash": "mock_issuer_name_hash",
                "issuer_key_hash": "mock_issuer_key_hash",
                "serial_number": "mock_serial_number",
            }
        )
        await self._call_and_log(
            request,
            Action.delete_certificate,
            DeleteCertificateStatusEnumType.accepted,
        )

    async def _send_get_installed_certificate_ids(self):
        request = ocpp.v201.call.GetInstalledCertificateIds(
            certificate_type=[GetCertificateIdUseEnumType.csms_root_certificate],
        )
        await self._call_and_log(
            request,
            Action.get_installed_certificate_ids,
            GetInstalledCertificateStatusEnumType.accepted,
        )

    async def _send_get_log(self):
        request = ocpp.v201.call.GetLog(
            log={"remote_location": "https://example.com/logs"},
            log_type=LogEnumType.diagnostics_log,
            request_id=_random_request_id(),
        )
        await self._call_and_log(request, Action.get_log, LogStatusEnumType.accepted)

    async def _send_get_transaction_status(self):
        transaction_id = next(iter(self._active_transactions), "")
        if not transaction_id:
            logger.warning("No active transaction found, using fallback ID")
            transaction_id = "test_transaction_123"
        request = ocpp.v201.call.GetTransactionStatus(
            transaction_id=transaction_id,
        )
        response = await self.call(request, suppress=False)
        logger.info(
            "%s response received: messages_in_queue=%s",
            Action.get_transaction_status,
            response.messages_in_queue,
        )

    async def _send_install_certificate(self):
        request = ocpp.v201.call.InstallCertificate(
            certificate_type=InstallCertificateUseEnumType.csms_root_certificate,
            certificate=(
                "-----BEGIN CERTIFICATE-----\n"
                "MIIBkTCB+wIUMockRootCertificate=\n"
                "-----END CERTIFICATE-----"
            ),
        )
        await self._call_and_log(
            request,
            Action.install_certificate,
            InstallCertificateStatusEnumType.accepted,
        )

    async def _send_set_network_profile(self):
        request = ocpp.v201.call.SetNetworkProfile(
            configuration_slot=1,
            connection_data={
                "ocpp_version": "OCPP20",
                "ocpp_transport": "JSON",
                "ocpp_csms_url": "ws://127.0.0.1:9000",
                "message_timeout": 30,
                "security_profile": 0,
                "ocpp_interface": "Wired0",
            },
        )
        await self._call_and_log(
            request,
            Action.set_network_profile,
            SetNetworkProfileStatusEnumType.accepted,
        )

    async def _send_update_firmware(self):
        request = ocpp.v201.call.UpdateFirmware(
            request_id=_random_request_id(),
            firmware={
                "location": "https://example.com/firmware/v2.0.bin",
                "retrieve_date_time": datetime.now(timezone.utc).isoformat(),
            },
        )
        await self._call_and_log(
            request, Action.update_firmware, UpdateFirmwareStatusEnumType.accepted
        )

    # --- Command dispatch ---

    async def _send_command(self, command_name: Action):
        logger.debug("Sending OCPP command %s", command_name)
        try:
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
                case Action.certificate_signed:
                    await self._send_certificate_signed()
                case Action.customer_information:
                    await self._send_customer_information()
                case Action.delete_certificate:
                    await self._send_delete_certificate()
                case Action.get_installed_certificate_ids:
                    await self._send_get_installed_certificate_ids()
                case Action.get_log:
                    await self._send_get_log()
                case Action.get_transaction_status:
                    await self._send_get_transaction_status()
                case Action.install_certificate:
                    await self._send_install_certificate()
                case Action.set_network_profile:
                    await self._send_set_network_profile()
                case Action.update_firmware:
                    await self._send_update_firmware()
                case _:
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

    def handle_connection_closed(self):
        logger.info("ChargePoint %s closed connection", self.id)
        if self._command_timer:
            self._command_timer.cancel()
        self._charge_points.discard(self)
        logger.debug("Connected ChargePoint(s): %d", len(self._charge_points))


async def on_connect(
    websocket,
    config: ServerConfig,
):
    """Handle new WebSocket connections from charge points."""
    try:
        requested_protocols = websocket.request.headers["Sec-WebSocket-Protocol"]
    except KeyError:
        logger.info("Client hasn't requested any Subprotocol. Closing Connection")
        return await websocket.close()

    if websocket.subprotocol:
        logger.info("Protocols Matched: %s", websocket.subprotocol)
    else:
        logger.warning(
            "Protocols Mismatched | Expected Subprotocols: %s,"
            " but client supports %s | Closing connection",
            websocket.available_subprotocols,
            requested_protocols,
        )
        return await websocket.close()

    charge_points: set[ChargePoint] = config.charge_points
    cp = ChargePoint(
        websocket,
        auth_config=config.auth_config,
        boot_sequence=config.boot_sequence,
        total_cost=config.total_cost,
        trigger_message_type=config.trigger_message_type,
        reset_type=config.reset_type,
        availability_status=config.availability_status,
        charge_points=charge_points,
        set_variables_data=config.set_variables_data,
        get_variables_data=config.get_variables_data,
    )
    if config.command_name:
        await cp.send_command(config.command_name, config.delay, config.period)
    elif config.commands:
        await cp.send_commands(config.commands)

    try:
        await cp.start()
    except ConnectionClosed:
        cp.handle_connection_closed()


def check_positive_number(value):
    try:
        value = float(value)
    except ValueError:
        raise argparse.ArgumentTypeError("must be a number") from None
    if not math.isfinite(value):
        raise argparse.ArgumentTypeError("must be a finite number")
    if value <= 0:
        raise argparse.ArgumentTypeError("must be a positive number")
    return value


def _parse_commands(commands_str: str) -> list[tuple[Action, float]]:
    result: list[tuple[Action, float]] = []
    for entry in commands_str.split(","):
        entry = entry.strip()
        if ":" not in entry:
            raise argparse.ArgumentTypeError(
                f"Invalid command entry '{entry}': expected 'CMD:DELAY' format"
            )
        cmd_str, delay_str = entry.split(":", 1)
        try:
            cmd = Action(cmd_str.strip())
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
        if delay <= 0:
            raise argparse.ArgumentTypeError(f"Delay must be positive, got {delay}")
        result.append((cmd, delay))
    return result


def _parse_set_variable_specs(specs_str: str) -> list[dict]:
    result = []
    for entry in specs_str.split(","):
        entry = entry.strip()
        if "=" not in entry or "." not in entry.split("=")[0]:
            raise argparse.ArgumentTypeError(
                f"Invalid variable spec '{entry}': expected 'Component.Variable=Value'"
            )
        component_var, value = entry.split("=", 1)
        component, variable = component_var.strip().split(".", 1)
        result.append(
            {
                "component": {"name": component.strip()},
                "variable": {"name": variable.strip()},
                "attribute_value": value.strip(),
            }
        )
    return result


def _parse_get_variable_specs(specs_str: str) -> list[dict]:
    result = []
    for entry in specs_str.split(","):
        entry = entry.strip()
        if "." not in entry:
            raise argparse.ArgumentTypeError(
                f"Invalid variable spec '{entry}': expected 'Component.Variable'"
            )
        component, variable = entry.split(".", 1)
        result.append(
            {
                "component": {"name": component.strip()},
                "variable": {"name": variable.strip()},
            }
        )
    return result


async def main():
    parser = argparse.ArgumentParser(description="OCPP2 Server")
    command_group = parser.add_mutually_exclusive_group()
    command_group.add_argument("-c", "--command", type=Action, help="command name")
    command_group.add_argument(
        "--commands",
        type=str,
        default=None,
        help=(
            'comma-separated command sequence: "CMD1:DELAY1,CMD2:DELAY2,..."'
            ' (e.g., "RequestStartTransaction:5,RequestStopTransaction:30")'
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

    # Charging configuration
    boot_group = parser.add_mutually_exclusive_group()
    boot_group.add_argument(
        "--boot-status",
        type=RegistrationStatusEnumType,
        default=None,
        help="boot notification response status (default: accepted)",
    )
    boot_group.add_argument(
        "--boot-status-sequence",
        type=str,
        default=None,
        help=(
            "comma-separated boot notification status sequence"
            " (e.g. pending,pending,accepted)"
        ),
    )
    parser.add_argument(
        "--total-cost",
        type=float,
        default=DEFAULT_TOTAL_COST,
        help=f"TransactionEvent.Updated total cost (default: {DEFAULT_TOTAL_COST})",
    )

    parser.add_argument(
        "--trigger-message",
        type=MessageTriggerEnumType,
        default=MessageTriggerEnumType.status_notification,
        help="TriggerMessage requested_message type (default: status_notification)",
    )
    parser.add_argument(
        "--reset-type",
        type=ResetEnumType,
        default=ResetEnumType.immediate,
        help="Reset type (default: immediate)",
    )
    parser.add_argument(
        "--availability-status",
        type=OperationalStatusEnumType,
        default=OperationalStatusEnumType.operative,
        help="ChangeAvailability operational status (default: operative)",
    )

    # Auth configuration
    parser.add_argument(
        "--auth-mode",
        type=str,
        choices=["normal", "offline", "whitelist", "blacklist", "rate_limit"],
        default="normal",
        help="Authorization mode (default: normal)",
    )
    parser.add_argument(
        "--whitelist",
        type=str,
        nargs="+",
        default=["valid_token", "test_token", "authorized_user"],
        help="Whitelist of authorized tokens (space-separated)",
    )
    parser.add_argument(
        "--blacklist",
        type=str,
        nargs="+",
        default=["blocked_token", "invalid_user"],
        help="Blacklist of blocked tokens (space-separated)",
    )
    parser.add_argument(
        "--offline",
        action="store_true",
        help="Simulate offline/network failure mode",
    )
    parser.add_argument(
        "--auth-group-id",
        type=str,
        default=None,
        help="groupIdToken id_token value to include in Authorize response",
    )
    parser.add_argument(
        "--auth-cache-expiry",
        type=int,
        default=None,
        help="cacheExpiryDateTime offset in seconds from now (e.g., 3600)",
    )

    parser.add_argument(
        "--set-variables",
        type=str,
        default=None,
        help=(
            'SetVariables data: "Component.Variable=Value,..." '
            '(e.g., "OCPPCommCtrlr.HeartbeatInterval=30")'
        ),
    )
    parser.add_argument(
        "--get-variables",
        type=str,
        default=None,
        help=(
            'GetVariables data: "Component.Variable,..." '
            '(e.g., "ChargingStation.AvailabilityState")'
        ),
    )

    args, _ = parser.parse_known_args()
    group.required = args.command is not None

    args = parser.parse_args()

    parsed_commands = _parse_commands(args.commands) if args.commands else None
    parsed_set_variables = (
        _parse_set_variable_specs(args.set_variables) if args.set_variables else None
    )
    parsed_get_variables = (
        _parse_get_variable_specs(args.get_variables) if args.get_variables else None
    )

    if args.boot_status_sequence is not None:
        boot_sequence = tuple(
            RegistrationStatusEnumType(s.strip())
            for s in args.boot_status_sequence.split(",")
        )
    elif args.boot_status is not None:
        boot_sequence = (args.boot_status,)
    else:
        boot_sequence = (RegistrationStatusEnumType.accepted,)

    auth_config = AuthConfig(
        mode=AuthMode(args.auth_mode),
        whitelist=tuple(args.whitelist),
        blacklist=tuple(args.blacklist),
        offline=args.offline,
        default_status=AuthorizationStatusEnumType.accepted,
        auth_group_id=args.auth_group_id,
        auth_cache_expiry=args.auth_cache_expiry,
    )

    config = ServerConfig(
        command_name=args.command,
        delay=args.delay,
        period=args.period,
        auth_config=auth_config,
        boot_sequence=boot_sequence,
        total_cost=args.total_cost,
        charge_points=set(),
        commands=parsed_commands,
        trigger_message_type=args.trigger_message,
        reset_type=args.reset_type,
        availability_status=args.availability_status,
        set_variables_data=parsed_set_variables,
        get_variables_data=parsed_get_variables,
    )

    logger.info(
        "Auth configuration: mode=%s, offline=%s",
        auth_config.mode,
        auth_config.offline,
    )

    loop = asyncio.get_running_loop()
    shutdown_count = 0
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

        def _on_signal(sig: signal.Signals) -> None:
            nonlocal shutdown_count
            shutdown_count += 1
            if shutdown_count == 1:
                logger.info("Received %s, initiating graceful shutdown...", sig.name)
                server.close()
                shutdown_event.set()
            else:
                logger.warning("Received %s again, forcing exit", sig.name)
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
            async with asyncio.timeout(SHUTDOWN_TIMEOUT):
                await server.wait_closed()
        except TimeoutError:
            logger.warning(
                "Shutdown timed out after %.0fs"
                " — connections may not have closed cleanly",
                SHUTDOWN_TIMEOUT,
            )

    logger.info("Server shutdown complete")


if __name__ == "__main__":
    logging.basicConfig(level=logging.DEBUG)
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
    sys.exit(0)
