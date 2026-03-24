"""Tests for the OCPP 2.0.1 mock server."""

import argparse
import contextlib
import logging
import signal
from typing import Any, ClassVar
from unittest.mock import AsyncMock, MagicMock, patch

import ocpp.v201.call
import ocpp.v201.call_result
import pytest
from ocpp.v201.enums import (
    Action,
    AuthorizationStatusEnumType,
    CertificateSignedStatusEnumType,
    ChangeAvailabilityStatusEnumType,
    ClearCacheStatusEnumType,
    CustomerInformationStatusEnumType,
    DataTransferStatusEnumType,
    DeleteCertificateStatusEnumType,
    GenericDeviceModelStatusEnumType,
    GenericStatusEnumType,
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
    RequestStartStopStatusEnumType,
    ResetEnumType,
    ResetStatusEnumType,
    SetNetworkProfileStatusEnumType,
    TransactionEventEnumType,
    TriggerMessageStatusEnumType,
    UnlockStatusEnumType,
    UpdateFirmwareStatusEnumType,
)

from server import (
    DEFAULT_HEARTBEAT_INTERVAL,
    DEFAULT_TOTAL_COST,
    MAX_REQUEST_ID,
    AuthConfig,
    AuthMode,
    ChargePoint,
    ServerConfig,
    _parse_commands,
    _parse_get_variable_specs,
    _parse_set_variable_specs,
    _random_request_id,
    check_positive_number,
    main,
    on_connect,
)

# --- Test constants ---
TEST_CHARGE_POINT_PATH = "/TestChargePoint"
TEST_VALID_TOKEN = "valid_token"  # noqa: S105
TEST_TOKEN = "test_token"  # noqa: S105
TEST_BLOCKED_TOKEN = "blocked_token"  # noqa: S105
TEST_TIMESTAMP = "2026-01-01T00:00:00Z"
TEST_TRANSACTION_ID = "txn-001"
TEST_EVSE_ID = 1
TEST_CONNECTOR_ID = 1
TEST_VENDOR_ID = "TestVendor"
TEST_VENDOR_NAME = "TestVendor"
TEST_MODEL = "Test"
TEST_CUSTOM_COST = 42.50


@pytest.fixture
def mock_connection():
    """Create a mock WebSocket connection for ChargePoint instantiation."""
    conn = MagicMock()
    conn.request = MagicMock()
    conn.request.path = TEST_CHARGE_POINT_PATH
    return conn


@pytest.fixture
def charge_point(mock_connection):
    """Create a ChargePoint instance with default auth config."""
    return ChargePoint(mock_connection)


@pytest.fixture
def whitelist_charge_point(mock_connection):
    """Create a ChargePoint with whitelist auth mode."""
    return ChargePoint(
        mock_connection,
        auth_config=AuthConfig(
            mode=AuthMode.whitelist,
            whitelist=(TEST_VALID_TOKEN, TEST_TOKEN),
            blacklist=(),
            offline=False,
            default_status=AuthorizationStatusEnumType.accepted,
        ),
    )


@pytest.fixture
def blacklist_charge_point(mock_connection):
    """Create a ChargePoint with blacklist auth mode."""
    return ChargePoint(
        mock_connection,
        auth_config=AuthConfig(
            mode=AuthMode.blacklist,
            whitelist=(),
            blacklist=(TEST_BLOCKED_TOKEN,),
            offline=False,
            default_status=AuthorizationStatusEnumType.accepted,
        ),
    )


@pytest.fixture
def offline_charge_point(mock_connection):
    """Create a ChargePoint with offline mode enabled."""
    return ChargePoint(
        mock_connection,
        auth_config=AuthConfig(
            mode=AuthMode.normal,
            whitelist=(),
            blacklist=(),
            offline=True,
            default_status=AuthorizationStatusEnumType.accepted,
        ),
    )


@pytest.fixture
def command_charge_point(mock_connection):
    """Create a ChargePoint with self.call mocked as AsyncMock."""
    cp = ChargePoint(mock_connection)
    cp.call = AsyncMock()
    return cp


@pytest.fixture
def rate_limit_charge_point(mock_connection):
    """Create a ChargePoint with rate_limit auth mode."""
    return ChargePoint(
        mock_connection,
        auth_config=AuthConfig(
            mode=AuthMode.rate_limit,
            whitelist=(),
            blacklist=(),
            offline=False,
            default_status=AuthorizationStatusEnumType.accepted,
        ),
    )


@pytest.fixture
def mock_valid_ws():
    """Create a mock WebSocket with valid OCPP 2.0.1 subprotocol."""
    ws = MagicMock()
    ws.request = MagicMock()
    ws.request.headers = {"Sec-WebSocket-Protocol": "ocpp2.0.1"}
    ws.subprotocol = "ocpp2.0.1"
    ws.request.path = "/TestCP"
    ws.close = AsyncMock()
    return ws


@pytest.fixture
def main_mocks():
    """Provide mock loop, server, shutdown event, and signal capture."""
    mock_loop = MagicMock()
    signal_handlers: dict[int, tuple] = {}

    def _capture_handler(sig, callback, *args):
        signal_handlers[sig] = (callback, args)

    mock_loop.add_signal_handler = MagicMock(side_effect=_capture_handler)

    mock_server = AsyncMock()
    mock_server.close = MagicMock()
    mock_server.wait_closed = AsyncMock()

    mock_event = MagicMock()
    mock_event.set = MagicMock()

    return mock_loop, mock_server, mock_event, signal_handlers


@contextlib.contextmanager
def _patch_main(mock_loop, mock_server, mock_event, extra_patches=None):
    args = argparse.Namespace(
        command=None,
        commands=None,
        delay=None,
        period=None,
        host="127.0.0.1",
        port=9000,
        boot_status=None,
        boot_status_sequence=None,
        total_cost=10.0,
        auth_mode="normal",
        whitelist=["valid_token"],
        blacklist=["blocked_token"],
        offline=False,
        auth_group_id=None,
        auth_cache_expiry=None,
        trigger_message=MessageTriggerEnumType.status_notification,
        reset_type=ResetEnumType.immediate,
        availability_status=OperationalStatusEnumType.operative,
        set_variables=None,
        get_variables=None,
    )
    mock_serve_cm = AsyncMock()
    mock_serve_cm.__aenter__ = AsyncMock(return_value=mock_server)
    mock_serve_cm.__aexit__ = AsyncMock(return_value=False)

    patches = [
        patch(
            "server.argparse.ArgumentParser.parse_known_args",
            return_value=(MagicMock(command=args.command), []),
        ),
        patch("server.argparse.ArgumentParser.parse_args", return_value=args),
        patch("server.websockets.serve", return_value=mock_serve_cm),
        patch("server.asyncio.get_running_loop", return_value=mock_loop),
        patch("server.asyncio.Event", return_value=mock_event),
        *(extra_patches or []),
    ]
    with contextlib.ExitStack() as stack:
        for p in patches:
            stack.enter_context(p)
        yield


class TestCheckPositiveNumber:
    """Tests for the check_positive_number argument validator."""

    def test_positive_integer(self):
        assert check_positive_number("5") == 5.0

    def test_positive_float(self):
        assert check_positive_number("3.14") == 3.14

    def test_zero_raises(self):
        with pytest.raises(
            argparse.ArgumentTypeError, match="must be a positive number"
        ):
            check_positive_number("0")

    def test_negative_raises(self):
        with pytest.raises(
            argparse.ArgumentTypeError, match="must be a positive number"
        ):
            check_positive_number("-1")

    def test_non_numeric_raises(self):
        with pytest.raises(argparse.ArgumentTypeError, match="must be a number"):
            check_positive_number("abc")

    @pytest.mark.parametrize("value", ["inf", "-inf"])
    def test_infinity_raises(self, value):
        with pytest.raises(argparse.ArgumentTypeError, match="must be a finite number"):
            check_positive_number(value)

    def test_nan_raises(self):
        with pytest.raises(argparse.ArgumentTypeError, match="must be a finite number"):
            check_positive_number("nan")


class TestRandomRequestId:
    """Tests for MAX_REQUEST_ID constant and _random_request_id helper."""

    def test_max_request_id_value(self):
        assert MAX_REQUEST_ID == 2**31 - 1

    def test_random_request_id_in_range(self):
        for _ in range(100):
            rid = _random_request_id()
            assert 1 <= rid <= MAX_REQUEST_ID

    def test_random_request_id_returns_int(self):
        assert isinstance(_random_request_id(), int)


class TestResolveAuthStatus:
    """Tests for the _resolve_auth_status method."""

    def test_normal_mode_accepts(self, charge_point):
        status = charge_point._resolve_auth_status("any_token")
        assert status == AuthorizationStatusEnumType.accepted

    def test_whitelist_mode_accepts_valid_token(self, whitelist_charge_point):
        status = whitelist_charge_point._resolve_auth_status(TEST_VALID_TOKEN)
        assert status == AuthorizationStatusEnumType.accepted

    def test_whitelist_mode_blocks_unknown_token(self, whitelist_charge_point):
        status = whitelist_charge_point._resolve_auth_status("unknown_token")
        assert status == AuthorizationStatusEnumType.blocked

    def test_blacklist_mode_blocks_blacklisted_token(self, blacklist_charge_point):
        status = blacklist_charge_point._resolve_auth_status(TEST_BLOCKED_TOKEN)
        assert status == AuthorizationStatusEnumType.blocked

    def test_blacklist_mode_accepts_valid_token(self, blacklist_charge_point):
        status = blacklist_charge_point._resolve_auth_status("good_token")
        assert status == AuthorizationStatusEnumType.accepted

    def test_rate_limit_mode(self, rate_limit_charge_point):
        status = rate_limit_charge_point._resolve_auth_status("any_token")
        assert status == AuthorizationStatusEnumType.not_at_this_time

    def test_whitelist_blocks_empty_token(self, whitelist_charge_point):
        status = whitelist_charge_point._resolve_auth_status("")
        assert status == AuthorizationStatusEnumType.blocked

    def test_blacklist_accepts_empty_token(self, blacklist_charge_point):
        status = blacklist_charge_point._resolve_auth_status("")
        assert status == AuthorizationStatusEnumType.accepted

    """Tests verifying all expected OCPP 2.0.1 handlers and commands are implemented."""

    EXPECTED_INCOMING_HANDLERS: ClassVar[list[str]] = [
        "on_boot_notification",
        "on_heartbeat",
        "on_status_notification",
        "on_authorize",
        "on_transaction_event",
        "on_meter_values",
        "on_notify_report",
        "on_data_transfer",
        "on_firmware_status_notification",
        "on_log_status_notification",
        "on_security_event_notification",
        "on_get_15118_ev_certificate",
        "on_get_certificate_status",
        "on_sign_certificate",
        "on_notify_customer_information",
    ]

    EXPECTED_OUTGOING_COMMANDS: ClassVar[list[str]] = [
        "_send_clear_cache",
        "_send_get_base_report",
        "_send_get_variables",
        "_send_set_variables",
        "_send_request_start_transaction",
        "_send_request_stop_transaction",
        "_send_reset",
        "_send_unlock_connector",
        "_send_change_availability",
        "_send_trigger_message",
        "_send_data_transfer",
        "_send_certificate_signed",
        "_send_customer_information",
        "_send_delete_certificate",
        "_send_get_installed_certificate_ids",
        "_send_get_log",
        "_send_get_transaction_status",
        "_send_install_certificate",
        "_send_set_network_profile",
        "_send_update_firmware",
    ]

    @pytest.mark.parametrize("handler_name", EXPECTED_INCOMING_HANDLERS)
    def test_incoming_handler_exists(self, handler_name):
        assert hasattr(ChargePoint, handler_name), (
            f"Missing incoming handler: {handler_name}"
        )
        assert callable(getattr(ChargePoint, handler_name))

    @pytest.mark.parametrize("method_name", EXPECTED_OUTGOING_COMMANDS)
    def test_outgoing_command_exists(self, method_name):
        assert hasattr(ChargePoint, method_name), (
            f"Missing outgoing command method: {method_name}"
        )
        assert callable(getattr(ChargePoint, method_name))


class TestChargePointDefaultConfig:
    """Tests for ChargePoint default configuration."""

    def test_default_auth_config(self, charge_point):
        assert charge_point._auth_config.mode == AuthMode.normal
        assert charge_point._auth_config.offline is False
        assert TEST_VALID_TOKEN in charge_point._auth_config.whitelist
        assert TEST_BLOCKED_TOKEN in charge_point._auth_config.blacklist

    def test_custom_auth_config(self, mock_connection):
        config = AuthConfig(
            mode=AuthMode.whitelist,
            whitelist=("token1",),
            blacklist=(),
            offline=False,
            default_status=AuthorizationStatusEnumType.accepted,
        )
        cp = ChargePoint(mock_connection, auth_config=config)
        assert cp._auth_config.mode == AuthMode.whitelist
        assert cp._auth_config.whitelist == ("token1",)

    def test_command_timer_initially_none(self, charge_point):
        assert charge_point._command_timer is None

    def test_default_boot_sequence(self, charge_point):
        assert charge_point._boot_sequence == (RegistrationStatusEnumType.accepted,)

    def test_custom_boot_sequence(self, mock_connection):
        cp = ChargePoint(
            mock_connection,
            boot_sequence=(RegistrationStatusEnumType.rejected,),
        )
        assert cp._boot_sequence == (RegistrationStatusEnumType.rejected,)

    def test_default_total_cost(self, charge_point):
        assert charge_point._total_cost == DEFAULT_TOTAL_COST

    def test_custom_total_cost(self, mock_connection):
        cp = ChargePoint(mock_connection, total_cost=25.50)
        assert cp._total_cost == 25.50


# --- Async handler tests ---


class TestBootNotificationHandler:
    """Tests for the BootNotification incoming handler."""

    async def test_returns_accepted_by_default(self, charge_point):
        response = await charge_point.on_boot_notification(
            charging_station={"model": TEST_MODEL, "vendor_name": TEST_VENDOR_NAME},
            reason="PowerUp",
        )
        assert response.status == RegistrationStatusEnumType.accepted
        assert response.interval == DEFAULT_HEARTBEAT_INTERVAL
        assert isinstance(response.current_time, str)
        assert "T" in response.current_time

    async def test_configurable_boot_status(self, mock_connection):
        cp = ChargePoint(
            mock_connection,
            boot_sequence=(RegistrationStatusEnumType.rejected,),
        )
        response = await cp.on_boot_notification(
            charging_station={"model": TEST_MODEL, "vendor_name": TEST_VENDOR_NAME},
            reason="PowerUp",
        )
        assert response.status == RegistrationStatusEnumType.rejected

    async def test_pending_boot_status(self, mock_connection):
        cp = ChargePoint(
            mock_connection,
            boot_sequence=(RegistrationStatusEnumType.pending,),
        )
        response = await cp.on_boot_notification(
            charging_station={"model": TEST_MODEL, "vendor_name": TEST_VENDOR_NAME},
            reason="PowerUp",
        )
        assert response.status == RegistrationStatusEnumType.pending

    async def test_boot_notification_single_status_compat(self, mock_connection):
        """Single-element sequence always returns the same status."""
        cp = ChargePoint(
            mock_connection,
            boot_sequence=(RegistrationStatusEnumType.accepted,),
        )
        for _ in range(3):
            response = await cp.on_boot_notification(
                charging_station={
                    "model": TEST_MODEL,
                    "vendor_name": TEST_VENDOR_NAME,
                },
                reason="PowerUp",
            )
            assert response.status == RegistrationStatusEnumType.accepted

    async def test_boot_notification_sequence_iterates(self, mock_connection):
        """Multi-element sequence iterates: Pending, Pending, Accepted."""
        cp = ChargePoint(
            mock_connection,
            boot_sequence=(
                RegistrationStatusEnumType.pending,
                RegistrationStatusEnumType.pending,
                RegistrationStatusEnumType.accepted,
            ),
        )
        r1 = await cp.on_boot_notification(
            charging_station={"model": TEST_MODEL, "vendor_name": TEST_VENDOR_NAME},
            reason="PowerUp",
        )
        assert r1.status == RegistrationStatusEnumType.pending

        r2 = await cp.on_boot_notification(
            charging_station={"model": TEST_MODEL, "vendor_name": TEST_VENDOR_NAME},
            reason="PowerUp",
        )
        assert r2.status == RegistrationStatusEnumType.pending

        r3 = await cp.on_boot_notification(
            charging_station={"model": TEST_MODEL, "vendor_name": TEST_VENDOR_NAME},
            reason="PowerUp",
        )
        assert r3.status == RegistrationStatusEnumType.accepted

    async def test_boot_notification_sequence_clamps_to_last(self, mock_connection):
        """Beyond sequence length, clamps to last element (no IndexError)."""
        cp = ChargePoint(
            mock_connection,
            boot_sequence=(
                RegistrationStatusEnumType.pending,
                RegistrationStatusEnumType.accepted,
            ),
        )
        await cp.on_boot_notification(
            charging_station={"model": TEST_MODEL, "vendor_name": TEST_VENDOR_NAME},
            reason="PowerUp",
        )
        await cp.on_boot_notification(
            charging_station={"model": TEST_MODEL, "vendor_name": TEST_VENDOR_NAME},
            reason="PowerUp",
        )
        r3 = await cp.on_boot_notification(
            charging_station={"model": TEST_MODEL, "vendor_name": TEST_VENDOR_NAME},
            reason="PowerUp",
        )
        r4 = await cp.on_boot_notification(
            charging_station={"model": TEST_MODEL, "vendor_name": TEST_VENDOR_NAME},
            reason="PowerUp",
        )
        assert r3.status == RegistrationStatusEnumType.accepted
        assert r4.status == RegistrationStatusEnumType.accepted

    async def test_boot_status_sequence_backwards_compat(self, mock_connection):
        """boot_sequence=(Accepted,) behaves same as old boot_status=Accepted."""
        cp = ChargePoint(
            mock_connection,
            boot_sequence=(RegistrationStatusEnumType.accepted,),
        )
        response = await cp.on_boot_notification(
            charging_station={"model": TEST_MODEL, "vendor_name": TEST_VENDOR_NAME},
            reason="PowerUp",
        )
        assert response.status == RegistrationStatusEnumType.accepted
        assert response.interval == DEFAULT_HEARTBEAT_INTERVAL


class TestHeartbeatHandler:
    """Tests for the Heartbeat incoming handler."""

    async def test_returns_current_time(self, charge_point):
        response = await charge_point.on_heartbeat()
        assert isinstance(response.current_time, str)
        assert "T" in response.current_time


class TestStatusNotificationHandler:
    """Tests for the StatusNotification incoming handler."""

    async def test_returns_empty_response(self, charge_point):
        response = await charge_point.on_status_notification(
            timestamp=TEST_TIMESTAMP,
            evse_id=TEST_EVSE_ID,
            connector_id=TEST_CONNECTOR_ID,
            connector_status="Available",
        )
        assert isinstance(response, ocpp.v201.call_result.StatusNotification)


class TestAuthorizeHandler:
    """Tests for the Authorize incoming handler."""

    async def test_normal_mode_accepts(self, charge_point):
        response = await charge_point.on_authorize(
            id_token={"id_token": "any_token", "type": "ISO14443"}
        )
        assert response.id_token_info["status"] == AuthorizationStatusEnumType.accepted

    async def test_whitelist_accepts_valid(self, whitelist_charge_point):
        response = await whitelist_charge_point.on_authorize(
            id_token={"id_token": TEST_VALID_TOKEN, "type": "ISO14443"}
        )
        assert response.id_token_info["status"] == AuthorizationStatusEnumType.accepted

    async def test_whitelist_blocks_unknown(self, whitelist_charge_point):
        response = await whitelist_charge_point.on_authorize(
            id_token={"id_token": "stranger", "type": "ISO14443"}
        )
        assert response.id_token_info["status"] == AuthorizationStatusEnumType.blocked

    async def test_offline_raises_internal_error(self, offline_charge_point):
        from ocpp.exceptions import InternalError

        with pytest.raises(InternalError):
            await offline_charge_point.on_authorize(
                id_token={"id_token": "any", "type": "ISO14443"}
            )

    async def test_blacklist_blocks_blacklisted(self, blacklist_charge_point):
        response = await blacklist_charge_point.on_authorize(
            id_token={"id_token": TEST_BLOCKED_TOKEN, "type": "ISO14443"}
        )
        assert response.id_token_info["status"] == AuthorizationStatusEnumType.blocked

    async def test_blacklist_accepts_unlisted(self, blacklist_charge_point):
        response = await blacklist_charge_point.on_authorize(
            id_token={"id_token": "unlisted_token", "type": "ISO14443"}
        )
        assert response.id_token_info["status"] == AuthorizationStatusEnumType.accepted

    async def test_rate_limit_rejects(self, rate_limit_charge_point):
        response = await rate_limit_charge_point.on_authorize(
            id_token={"id_token": "any_token", "type": "ISO14443"}
        )
        assert (
            response.id_token_info["status"]
            == AuthorizationStatusEnumType.not_at_this_time
        )


class TestRicherAuthorizeResponse:
    """Tests for richer Authorize response with groupIdToken and cacheExpiry."""

    async def test_authorize_includes_group_id_token(self, mock_connection):
        cp = ChargePoint(
            mock_connection,
            auth_config=AuthConfig(
                mode=AuthMode.normal,
                whitelist=(),
                blacklist=(),
                offline=False,
                default_status=AuthorizationStatusEnumType.accepted,
                auth_group_id="MyGroup",
            ),
        )
        result = await cp.on_authorize(
            id_token={"id_token": "test_token", "type": "ISO14443"}
        )
        assert result.id_token_info["group_id_token"]["id_token"] == "MyGroup"  # noqa: S105
        assert result.id_token_info["group_id_token"]["type"] == "Central"

    async def test_authorize_includes_cache_expiry(self, mock_connection):
        cp = ChargePoint(
            mock_connection,
            auth_config=AuthConfig(
                mode=AuthMode.normal,
                whitelist=(),
                blacklist=(),
                offline=False,
                default_status=AuthorizationStatusEnumType.accepted,
                auth_cache_expiry=3600,
            ),
        )
        result = await cp.on_authorize(
            id_token={"id_token": "test_token", "type": "ISO14443"}
        )
        assert "cache_expiry_date_time" in result.id_token_info

    async def test_authorize_no_enrichment_by_default(self, charge_point):
        result = await charge_point.on_authorize(
            id_token={"id_token": "test_token", "type": "ISO14443"}
        )
        assert "group_id_token" not in result.id_token_info
        assert "cache_expiry_date_time" not in result.id_token_info


class TestTransactionEventHandler:
    """Tests for the TransactionEvent incoming handler."""

    async def test_started_returns_auth_status(self, charge_point):
        response = await charge_point.on_transaction_event(
            event_type=TransactionEventEnumType.started,
            timestamp=TEST_TIMESTAMP,
            trigger_reason="Authorized",
            seq_no=0,
            transaction_info={"transaction_id": TEST_TRANSACTION_ID},
            id_token={"id_token": TEST_TOKEN, "type": "ISO14443"},
        )
        assert response.id_token_info["status"] == AuthorizationStatusEnumType.accepted

    async def test_updated_returns_total_cost(self, charge_point):
        response = await charge_point.on_transaction_event(
            event_type=TransactionEventEnumType.updated,
            timestamp=TEST_TIMESTAMP,
            trigger_reason="MeterValuePeriodic",
            seq_no=1,
            transaction_info={"transaction_id": TEST_TRANSACTION_ID},
        )
        assert response.total_cost == DEFAULT_TOTAL_COST

    async def test_updated_uses_custom_total_cost(self, mock_connection):
        cp = ChargePoint(mock_connection, total_cost=TEST_CUSTOM_COST)
        response = await cp.on_transaction_event(
            event_type=TransactionEventEnumType.updated,
            timestamp=TEST_TIMESTAMP,
            trigger_reason="MeterValuePeriodic",
            seq_no=1,
            transaction_info={"transaction_id": TEST_TRANSACTION_ID},
        )
        assert response.total_cost == TEST_CUSTOM_COST

    async def test_ended_returns_empty(self, charge_point):
        response = await charge_point.on_transaction_event(
            event_type=TransactionEventEnumType.ended,
            timestamp=TEST_TIMESTAMP,
            trigger_reason="StopAuthorized",
            seq_no=2,
            transaction_info={"transaction_id": TEST_TRANSACTION_ID},
        )
        assert response.total_cost is None
        assert response.id_token_info is None

    async def test_unknown_event_type_returns_empty(self, charge_point):
        response = await charge_point.on_transaction_event(
            event_type="UnknownType",
            timestamp=TEST_TIMESTAMP,
            trigger_reason="Unknown",
            seq_no=0,
            transaction_info={"transaction_id": TEST_TRANSACTION_ID},
        )
        assert response.total_cost is None
        assert response.id_token_info is None

    """Tests for the DataTransfer incoming handler."""

    async def test_returns_accepted(self, charge_point):
        response = await charge_point.on_data_transfer(vendor_id=TEST_VENDOR_ID)
        assert response.status == DataTransferStatusEnumType.accepted


class TestTransactionTracking:
    """Tests for active transaction tracking in ChargePoint."""

    async def test_transaction_event_started_stores_transaction(self, charge_point):
        await charge_point.on_transaction_event(
            event_type=TransactionEventEnumType.started,
            timestamp=TEST_TIMESTAMP,
            trigger_reason="Authorized",
            seq_no=0,
            transaction_info={"transaction_id": TEST_TRANSACTION_ID},
            id_token={"id_token": TEST_TOKEN, "type": "ISO14443"},
            evse={"id": TEST_EVSE_ID},
        )
        assert TEST_TRANSACTION_ID in charge_point._active_transactions
        assert charge_point._active_transactions[TEST_TRANSACTION_ID] == TEST_EVSE_ID

    async def test_transaction_event_ended_removes_transaction(self, charge_point):
        charge_point._active_transactions[TEST_TRANSACTION_ID] = TEST_EVSE_ID
        await charge_point.on_transaction_event(
            event_type=TransactionEventEnumType.ended,
            timestamp=TEST_TIMESTAMP,
            trigger_reason="StopAuthorized",
            seq_no=2,
            transaction_info={"transaction_id": TEST_TRANSACTION_ID},
        )
        assert TEST_TRANSACTION_ID not in charge_point._active_transactions

    async def test_send_request_stop_uses_active_transaction_id(
        self, command_charge_point
    ):
        command_charge_point._active_transactions["real-txn-999"] = TEST_EVSE_ID
        command_charge_point.call.return_value = (
            ocpp.v201.call_result.RequestStopTransaction(
                status=RequestStartStopStatusEnumType.accepted
            )
        )
        await command_charge_point._send_request_stop_transaction()
        request = command_charge_point.call.call_args[0][0]
        assert request.transaction_id == "real-txn-999"

    async def test_send_get_transaction_status_uses_active_transaction_id(
        self, command_charge_point
    ):
        command_charge_point._active_transactions["real-txn-999"] = TEST_EVSE_ID
        command_charge_point.call.return_value = (
            ocpp.v201.call_result.GetTransactionStatus(messages_in_queue=False)
        )
        await command_charge_point._send_get_transaction_status()
        request = command_charge_point.call.call_args[0][0]
        assert request.transaction_id == "real-txn-999"

    async def test_send_request_stop_fallback_when_no_transaction(
        self, command_charge_point
    ):
        command_charge_point.call.return_value = (
            ocpp.v201.call_result.RequestStopTransaction(
                status=RequestStartStopStatusEnumType.accepted
            )
        )
        await command_charge_point._send_request_stop_transaction()
        request = command_charge_point.call.call_args[0][0]
        assert request.transaction_id == "test_transaction_123"


class TestCertificateHandlers:
    """Tests for certificate-related incoming handlers."""

    async def test_get_15118_ev_certificate(self, charge_point):
        response = await charge_point.on_get_15118_ev_certificate(
            iso15118_schema_version="urn:iso:15118:2:2013:MsgDef",
            action="Install",
            exi_request="mock_exi_data",
        )
        assert response.status == Iso15118EVCertificateStatusEnumType.accepted
        assert response.exi_response == "mock_exi_response_data"

    async def test_get_certificate_status(self, charge_point):
        response = await charge_point.on_get_certificate_status(
            ocsp_request_data={
                "hash_algorithm": "SHA256",
                "issuer_name_hash": "mock",
                "issuer_key_hash": "mock",
                "serial_number": "mock",
                "responder_url": "https://ocsp.example.com",
            }
        )
        assert response.status == GetCertificateStatusEnumType.accepted

    async def test_sign_certificate(self, charge_point):
        response = await charge_point.on_sign_certificate(csr="mock_csr_data")
        assert response.status == GenericStatusEnumType.accepted


class TestNotificationHandlers:
    """Tests for notification incoming handlers with empty responses."""

    async def test_meter_values(self, charge_point):
        response = await charge_point.on_meter_values(
            evse_id=TEST_EVSE_ID,
            meter_value=[{"timestamp": TEST_TIMESTAMP}],
        )
        assert isinstance(response, ocpp.v201.call_result.MeterValues)

    async def test_notify_report(self, charge_point):
        response = await charge_point.on_notify_report(
            request_id=1,
            generated_at=TEST_TIMESTAMP,
            seq_no=0,
        )
        assert isinstance(response, ocpp.v201.call_result.NotifyReport)

    async def test_firmware_status_notification(self, charge_point):
        response = await charge_point.on_firmware_status_notification(
            status="Installed"
        )
        assert isinstance(response, ocpp.v201.call_result.FirmwareStatusNotification)

    async def test_log_status_notification(self, charge_point):
        response = await charge_point.on_log_status_notification(
            status="Uploaded", request_id=1
        )
        assert isinstance(response, ocpp.v201.call_result.LogStatusNotification)

    async def test_security_event_notification(self, charge_point):
        response = await charge_point.on_security_event_notification(
            event_type="FirmwareUpdated", timestamp=TEST_TIMESTAMP
        )
        assert isinstance(response, ocpp.v201.call_result.SecurityEventNotification)

    async def test_notify_customer_information(self, charge_point):
        response = await charge_point.on_notify_customer_information(
            data="customer_data",
            seq_no=0,
            generated_at=TEST_TIMESTAMP,
            request_id=1,
        )
        assert isinstance(response, ocpp.v201.call_result.NotifyCustomerInformation)


class TestSendCommandErrorHandling:
    """Tests for error handling in the command dispatch layer."""

    async def test_timeout_is_caught(self, charge_point):
        with patch.object(
            charge_point, "_send_clear_cache", side_effect=TimeoutError("timed out")
        ):
            await charge_point._send_command(command_name=Action.clear_cache)

    async def test_ocpp_error_is_caught(self, charge_point):
        from ocpp.exceptions import InternalError as OCPPInternalError

        with patch.object(
            charge_point,
            "_send_clear_cache",
            side_effect=OCPPInternalError(description="test error"),
        ):
            await charge_point._send_command(command_name=Action.clear_cache)

    async def test_connection_closed_is_caught(self, charge_point):
        from websockets.exceptions import ConnectionClosedOK
        from websockets.frames import Close

        with (
            patch.object(
                charge_point,
                "_send_clear_cache",
                side_effect=ConnectionClosedOK(
                    Close(1000, ""), Close(1000, ""), rcvd_then_sent=True
                ),
            ),
            patch.object(charge_point, "handle_connection_closed"),
        ):
            await charge_point._send_command(command_name=Action.clear_cache)
            charge_point.handle_connection_closed.assert_called_once()

    async def test_unsupported_command_logs_warning(self, charge_point):
        unsupported = MagicMock(value="Unsupported")
        await charge_point._send_command(command_name=unsupported)


class TestOutgoingCommands:
    """Behavioral tests for all 20 _send_* outgoing command methods."""

    # --- Success path tests ---

    async def test_send_clear_cache(self, command_charge_point):
        command_charge_point.call.return_value = ocpp.v201.call_result.ClearCache(
            status=ClearCacheStatusEnumType.accepted
        )
        await command_charge_point._send_clear_cache()
        command_charge_point.call.assert_called_once()
        request = command_charge_point.call.call_args[0][0]
        assert isinstance(request, ocpp.v201.call.ClearCache)

    async def test_send_get_base_report(self, command_charge_point):
        command_charge_point.call.return_value = ocpp.v201.call_result.GetBaseReport(
            status=GenericDeviceModelStatusEnumType.accepted
        )
        await command_charge_point._send_get_base_report()
        command_charge_point.call.assert_called_once()
        request = command_charge_point.call.call_args[0][0]
        assert isinstance(request, ocpp.v201.call.GetBaseReport)
        assert request.request_id > 0
        assert request.report_base == ReportBaseEnumType.full_inventory

    async def test_send_get_variables(self, command_charge_point):
        command_charge_point.call.return_value = ocpp.v201.call_result.GetVariables(
            get_variable_result=[]
        )
        await command_charge_point._send_get_variables()
        command_charge_point.call.assert_called_once()
        request = command_charge_point.call.call_args[0][0]
        assert isinstance(request, ocpp.v201.call.GetVariables)
        assert isinstance(request.get_variable_data, list)
        assert len(request.get_variable_data) > 0

    async def test_send_set_variables(self, command_charge_point):
        command_charge_point.call.return_value = ocpp.v201.call_result.SetVariables(
            set_variable_result=[]
        )
        await command_charge_point._send_set_variables()
        command_charge_point.call.assert_called_once()
        request = command_charge_point.call.call_args[0][0]
        assert isinstance(request, ocpp.v201.call.SetVariables)
        assert isinstance(request.set_variable_data, list)
        assert len(request.set_variable_data) > 0

    async def test_send_request_start_transaction(self, command_charge_point):
        command_charge_point.call.return_value = (
            ocpp.v201.call_result.RequestStartTransaction(
                status=RequestStartStopStatusEnumType.accepted
            )
        )
        await command_charge_point._send_request_start_transaction()
        command_charge_point.call.assert_called_once()
        request = command_charge_point.call.call_args[0][0]
        assert isinstance(request, ocpp.v201.call.RequestStartTransaction)
        assert isinstance(request.id_token, dict)
        assert request.evse_id == TEST_EVSE_ID
        assert request.remote_start_id > 0

    async def test_send_request_stop_transaction(self, command_charge_point):
        command_charge_point.call.return_value = (
            ocpp.v201.call_result.RequestStopTransaction(
                status=RequestStartStopStatusEnumType.accepted
            )
        )
        await command_charge_point._send_request_stop_transaction()
        command_charge_point.call.assert_called_once()
        request = command_charge_point.call.call_args[0][0]
        assert isinstance(request, ocpp.v201.call.RequestStopTransaction)
        assert request.transaction_id == "test_transaction_123"

    async def test_send_reset(self, command_charge_point):
        command_charge_point.call.return_value = ocpp.v201.call_result.Reset(
            status=ResetStatusEnumType.accepted
        )
        await command_charge_point._send_reset()
        command_charge_point.call.assert_called_once()
        request = command_charge_point.call.call_args[0][0]
        assert isinstance(request, ocpp.v201.call.Reset)
        assert request.type == ResetEnumType.immediate

    async def test_send_unlock_connector(self, command_charge_point):
        command_charge_point.call.return_value = ocpp.v201.call_result.UnlockConnector(
            status=UnlockStatusEnumType.unlocked
        )
        await command_charge_point._send_unlock_connector()
        command_charge_point.call.assert_called_once()
        request = command_charge_point.call.call_args[0][0]
        assert isinstance(request, ocpp.v201.call.UnlockConnector)
        assert request.evse_id == TEST_EVSE_ID
        assert request.connector_id == TEST_CONNECTOR_ID

    async def test_send_change_availability(self, command_charge_point):
        command_charge_point.call.return_value = (
            ocpp.v201.call_result.ChangeAvailability(
                status=ChangeAvailabilityStatusEnumType.accepted
            )
        )
        await command_charge_point._send_change_availability()
        command_charge_point.call.assert_called_once()
        request = command_charge_point.call.call_args[0][0]
        assert isinstance(request, ocpp.v201.call.ChangeAvailability)
        assert request.operational_status == OperationalStatusEnumType.operative

    async def test_send_trigger_message(self, command_charge_point):
        command_charge_point.call.return_value = ocpp.v201.call_result.TriggerMessage(
            status=TriggerMessageStatusEnumType.accepted
        )
        await command_charge_point._send_trigger_message()
        command_charge_point.call.assert_called_once()
        request = command_charge_point.call.call_args[0][0]
        assert isinstance(request, ocpp.v201.call.TriggerMessage)
        assert request.requested_message == MessageTriggerEnumType.status_notification

    async def test_send_data_transfer(self, command_charge_point):
        command_charge_point.call.return_value = ocpp.v201.call_result.DataTransfer(
            status=DataTransferStatusEnumType.accepted
        )
        await command_charge_point._send_data_transfer()
        command_charge_point.call.assert_called_once()
        request = command_charge_point.call.call_args[0][0]
        assert isinstance(request, ocpp.v201.call.DataTransfer)
        assert request.vendor_id == TEST_VENDOR_ID
        assert request.message_id == "TestMessage"
        assert request.data == "test_data"

    async def test_send_certificate_signed(self, command_charge_point):
        command_charge_point.call.return_value = (
            ocpp.v201.call_result.CertificateSigned(
                status=CertificateSignedStatusEnumType.accepted
            )
        )
        await command_charge_point._send_certificate_signed()
        command_charge_point.call.assert_called_once()
        request = command_charge_point.call.call_args[0][0]
        assert isinstance(request, ocpp.v201.call.CertificateSigned)
        assert "CERTIFICATE" in request.certificate_chain

    async def test_send_customer_information(self, command_charge_point):
        command_charge_point.call.return_value = (
            ocpp.v201.call_result.CustomerInformation(
                status=CustomerInformationStatusEnumType.accepted
            )
        )
        await command_charge_point._send_customer_information()
        command_charge_point.call.assert_called_once()
        request = command_charge_point.call.call_args[0][0]
        assert isinstance(request, ocpp.v201.call.CustomerInformation)
        assert request.request_id > 0
        assert request.report is True
        assert request.clear is False

    async def test_send_delete_certificate(self, command_charge_point):
        command_charge_point.call.return_value = (
            ocpp.v201.call_result.DeleteCertificate(
                status=DeleteCertificateStatusEnumType.accepted
            )
        )
        await command_charge_point._send_delete_certificate()
        command_charge_point.call.assert_called_once()
        request = command_charge_point.call.call_args[0][0]
        assert isinstance(request, ocpp.v201.call.DeleteCertificate)
        assert "hash_algorithm" in request.certificate_hash_data
        assert "serial_number" in request.certificate_hash_data

    async def test_send_get_installed_certificate_ids(self, command_charge_point):
        command_charge_point.call.return_value = (
            ocpp.v201.call_result.GetInstalledCertificateIds(
                status=GetInstalledCertificateStatusEnumType.accepted
            )
        )
        await command_charge_point._send_get_installed_certificate_ids()
        command_charge_point.call.assert_called_once()
        request = command_charge_point.call.call_args[0][0]
        assert isinstance(request, ocpp.v201.call.GetInstalledCertificateIds)
        assert isinstance(request.certificate_type, list)

    async def test_send_get_log(self, command_charge_point):
        command_charge_point.call.return_value = ocpp.v201.call_result.GetLog(
            status=LogStatusEnumType.accepted
        )
        await command_charge_point._send_get_log()
        command_charge_point.call.assert_called_once()
        request = command_charge_point.call.call_args[0][0]
        assert isinstance(request, ocpp.v201.call.GetLog)
        assert request.request_id > 0
        assert isinstance(request.log, dict)
        assert request.log_type == LogEnumType.diagnostics_log

    async def test_send_get_transaction_status(self, command_charge_point):
        command_charge_point.call.return_value = (
            ocpp.v201.call_result.GetTransactionStatus(messages_in_queue=False)
        )
        await command_charge_point._send_get_transaction_status()
        command_charge_point.call.assert_called_once()
        request = command_charge_point.call.call_args[0][0]
        assert isinstance(request, ocpp.v201.call.GetTransactionStatus)
        assert request.transaction_id == "test_transaction_123"

    async def test_send_install_certificate(self, command_charge_point):
        command_charge_point.call.return_value = (
            ocpp.v201.call_result.InstallCertificate(
                status=InstallCertificateStatusEnumType.accepted
            )
        )
        await command_charge_point._send_install_certificate()
        command_charge_point.call.assert_called_once()
        request = command_charge_point.call.call_args[0][0]
        assert isinstance(request, ocpp.v201.call.InstallCertificate)
        assert "CERTIFICATE" in request.certificate
        assert (
            request.certificate_type
            == InstallCertificateUseEnumType.csms_root_certificate
        )

    async def test_send_set_network_profile(self, command_charge_point):
        command_charge_point.call.return_value = (
            ocpp.v201.call_result.SetNetworkProfile(
                status=SetNetworkProfileStatusEnumType.accepted
            )
        )
        await command_charge_point._send_set_network_profile()
        command_charge_point.call.assert_called_once()
        request = command_charge_point.call.call_args[0][0]
        assert isinstance(request, ocpp.v201.call.SetNetworkProfile)
        assert request.configuration_slot == 1
        assert isinstance(request.connection_data, dict)

    async def test_send_update_firmware(self, command_charge_point):
        command_charge_point.call.return_value = ocpp.v201.call_result.UpdateFirmware(
            status=UpdateFirmwareStatusEnumType.accepted
        )
        await command_charge_point._send_update_firmware()
        command_charge_point.call.assert_called_once()
        request = command_charge_point.call.call_args[0][0]
        assert isinstance(request, ocpp.v201.call.UpdateFirmware)
        assert request.request_id > 0
        assert isinstance(request.firmware, dict)

    # --- Failure path tests (rejected/failed status → correct logging) ---

    FAILURE_PATH_CASES: ClassVar[list[tuple[str, type, object]]] = [
        (
            "_send_clear_cache",
            ocpp.v201.call_result.ClearCache,
            ClearCacheStatusEnumType.rejected,
        ),
        (
            "_send_reset",
            ocpp.v201.call_result.Reset,
            ResetStatusEnumType.rejected,
        ),
        (
            "_send_data_transfer",
            ocpp.v201.call_result.DataTransfer,
            DataTransferStatusEnumType.rejected,
        ),
        (
            "_send_get_installed_certificate_ids",
            ocpp.v201.call_result.GetInstalledCertificateIds,
            GetInstalledCertificateStatusEnumType.notFound,
        ),
        (
            "_send_get_base_report",
            ocpp.v201.call_result.GetBaseReport,
            GenericDeviceModelStatusEnumType.rejected,
        ),
        (
            "_send_unlock_connector",
            ocpp.v201.call_result.UnlockConnector,
            UnlockStatusEnumType.unlock_failed,
        ),
        (
            "_send_change_availability",
            ocpp.v201.call_result.ChangeAvailability,
            ChangeAvailabilityStatusEnumType.rejected,
        ),
        (
            "_send_trigger_message",
            ocpp.v201.call_result.TriggerMessage,
            TriggerMessageStatusEnumType.rejected,
        ),
        (
            "_send_certificate_signed",
            ocpp.v201.call_result.CertificateSigned,
            CertificateSignedStatusEnumType.rejected,
        ),
        (
            "_send_customer_information",
            ocpp.v201.call_result.CustomerInformation,
            CustomerInformationStatusEnumType.rejected,
        ),
        (
            "_send_delete_certificate",
            ocpp.v201.call_result.DeleteCertificate,
            DeleteCertificateStatusEnumType.failed,
        ),
        (
            "_send_get_log",
            ocpp.v201.call_result.GetLog,
            LogStatusEnumType.rejected,
        ),
        (
            "_send_install_certificate",
            ocpp.v201.call_result.InstallCertificate,
            InstallCertificateStatusEnumType.rejected,
        ),
        (
            "_send_set_network_profile",
            ocpp.v201.call_result.SetNetworkProfile,
            SetNetworkProfileStatusEnumType.rejected,
        ),
        (
            "_send_update_firmware",
            ocpp.v201.call_result.UpdateFirmware,
            UpdateFirmwareStatusEnumType.rejected,
        ),
    ]

    @pytest.mark.parametrize(
        ("method_name", "result_cls", "failed_status"),
        FAILURE_PATH_CASES,
        ids=[c[0] for c in FAILURE_PATH_CASES],
    )
    async def test_send_command_failure_logs(
        self, command_charge_point, caplog, method_name, result_cls, failed_status
    ):
        caplog.set_level(logging.INFO)
        command_charge_point.call.return_value = result_cls(status=failed_status)
        await getattr(command_charge_point, method_name)()
        assert any(
            r.levelno == logging.INFO and "failed" in r.message.lower()
            for r in caplog.records
        )


class TestOnConnect:
    """Tests for the on_connect WebSocket connection handler."""

    @staticmethod
    def _make_config(**overrides):
        defaults: dict[str, Any] = {
            "command_name": None,
            "delay": None,
            "period": None,
            "auth_config": AuthConfig(
                mode=AuthMode.normal,
                whitelist=(),
                blacklist=(),
                offline=False,
                default_status=AuthorizationStatusEnumType.accepted,
            ),
            "boot_sequence": (RegistrationStatusEnumType.accepted,),
            "total_cost": 0.0,
            "charge_points": set(),
        }
        defaults.update(overrides)
        return ServerConfig(**defaults)

    async def test_missing_subprotocol_header_closes_connection(self):
        mock_ws = MagicMock()
        mock_ws.request = MagicMock()
        mock_ws.request.headers = {}
        mock_ws.close = AsyncMock()
        config = self._make_config()

        await on_connect(mock_ws, config=config)
        mock_ws.close.assert_called_once()

    async def test_protocol_mismatch_closes_connection(self):
        mock_ws = MagicMock()
        mock_ws.request = MagicMock()
        mock_ws.request.headers = {"Sec-WebSocket-Protocol": "ocpp1.6"}
        mock_ws.subprotocol = None
        mock_ws.close = AsyncMock()
        config = self._make_config()

        await on_connect(mock_ws, config=config)
        mock_ws.close.assert_called_once()

    async def test_successful_connection_creates_charge_point(self, mock_valid_ws):
        config = self._make_config()

        with patch("server.ChargePoint") as MockCP:
            mock_cp = AsyncMock()
            MockCP.return_value = mock_cp
            await on_connect(mock_valid_ws, config=config)
            mock_cp.start.assert_called_once()

    async def test_connection_closed_during_start_triggers_cleanup(self, mock_valid_ws):
        from websockets.exceptions import ConnectionClosedOK
        from websockets.frames import Close

        config = self._make_config()

        exc = ConnectionClosedOK(Close(1000, ""), Close(1000, ""), rcvd_then_sent=True)

        with patch("server.ChargePoint") as MockCP:
            mock_cp = AsyncMock()
            mock_cp.start = AsyncMock(side_effect=exc)
            mock_cp.handle_connection_closed = MagicMock()
            MockCP.return_value = mock_cp
            await on_connect(mock_valid_ws, config=config)
            mock_cp.handle_connection_closed.assert_called_once()

    async def test_command_sent_on_connect_when_specified(self, mock_valid_ws):
        config = self._make_config(
            command_name=Action.clear_cache, delay=1.0, period=None
        )

        with patch("server.ChargePoint") as MockCP:
            mock_cp = AsyncMock()
            MockCP.return_value = mock_cp
            await on_connect(mock_valid_ws, config=config)
            mock_cp.send_command.assert_called_once_with(Action.clear_cache, 1.0, None)


class TestHandleConnectionClosed:
    """Tests for the handle_connection_closed cleanup method."""

    def test_timer_cancelled_on_close(self, charge_point):
        mock_timer = MagicMock()
        charge_point._command_timer = mock_timer
        charge_point.handle_connection_closed()
        mock_timer.cancel.assert_called_once()

    def test_timer_none_no_error(self, charge_point):
        charge_point._command_timer = None
        charge_point.handle_connection_closed()

    def test_charge_point_removed_from_set(self, charge_point):
        assert charge_point in charge_point._charge_points
        charge_point.handle_connection_closed()
        assert charge_point not in charge_point._charge_points

    def test_charge_point_not_in_set_no_error(self, charge_point):
        charge_point._charge_points = set()
        charge_point.handle_connection_closed()


class TestSendCommand:
    """Tests for Timer creation logic in send_command."""

    async def test_delay_creates_one_shot_timer(self, charge_point):
        with patch("server.Timer") as MockTimer:
            mock_timer = MagicMock()
            MockTimer.return_value = mock_timer
            await charge_point.send_command(Action.clear_cache, delay=1.0, period=None)
            MockTimer.assert_called_once()
            args = MockTimer.call_args[0]
            assert args[0] == 1.0
            assert args[1] is False

    async def test_period_creates_repeating_timer(self, charge_point):
        with patch("server.Timer") as MockTimer:
            mock_timer = MagicMock()
            MockTimer.return_value = mock_timer
            await charge_point.send_command(Action.clear_cache, delay=None, period=1.0)
            MockTimer.assert_called_once()
            args = MockTimer.call_args[0]
            assert args[0] == 1.0
            assert args[1] is True

    async def test_no_timer_when_both_none(self, charge_point):
        with patch("server.Timer") as MockTimer:
            await charge_point.send_command(Action.clear_cache, delay=None, period=None)
            MockTimer.assert_not_called()

    async def test_second_call_no_op_when_timer_exists(self, charge_point):
        charge_point._command_timer = MagicMock()
        with patch("server.Timer") as MockTimer:
            await charge_point.send_command(Action.clear_cache, delay=1.0, period=None)
            MockTimer.assert_not_called()


class TestMainGracefulShutdown:
    """Tests for the main() graceful shutdown logic."""

    @pytest.mark.parametrize("sig", [signal.SIGINT, signal.SIGTERM])
    async def test_first_signal_closes_server_and_sets_event(self, main_mocks, sig):
        mock_loop, mock_server, mock_event, signal_handlers = main_mocks

        async def _fire_signal():
            handler, args = signal_handlers[sig]
            handler(*args)

        mock_event.wait = AsyncMock(side_effect=_fire_signal)

        with _patch_main(mock_loop, mock_server, mock_event):
            await main()

        mock_server.close.assert_called_once()
        mock_event.set.assert_called_once()
        mock_server.wait_closed.assert_called_once()

    async def test_second_signal_forces_exit(self, main_mocks):
        mock_loop, mock_server, mock_event, signal_handlers = main_mocks

        async def _fire_twice():
            handler, args = signal_handlers[signal.SIGINT]
            handler(*args)
            handler(*args)

        mock_event.wait = AsyncMock(side_effect=_fire_twice)

        with _patch_main(mock_loop, mock_server, mock_event):
            with pytest.raises(SystemExit) as exc_info:
                await main()
            assert exc_info.value.code == 128 + signal.SIGINT.value

    async def test_shutdown_timeout_logs_warning(self, main_mocks, caplog):
        mock_loop, mock_server, mock_event, signal_handlers = main_mocks
        mock_server.wait_closed = AsyncMock(side_effect=TimeoutError)

        async def _fire_sigint():
            handler, args = signal_handlers[signal.SIGINT]
            handler(*args)

        mock_event.wait = AsyncMock(side_effect=_fire_sigint)
        caplog.set_level(logging.WARNING)

        with _patch_main(mock_loop, mock_server, mock_event):
            await main()

        assert any(
            r.levelno == logging.WARNING and "timed out" in r.message.lower()
            for r in caplog.records
        )

    async def test_windows_fallback_registers_signal_handlers(self, main_mocks):
        mock_loop, mock_server, mock_event, _ = main_mocks
        mock_loop.add_signal_handler = MagicMock(side_effect=NotImplementedError)
        mock_event.wait = AsyncMock()

        mock_signal_fn = MagicMock()

        with _patch_main(
            mock_loop,
            mock_server,
            mock_event,
            extra_patches=[patch("server.signal.signal", mock_signal_fn)],
        ):
            await main()

        assert mock_signal_fn.call_count == 2
        registered_signals = {call.args[0] for call in mock_signal_fn.call_args_list}
        assert registered_signals == {signal.SIGINT, signal.SIGTERM}

    async def test_windows_handler_schedules_via_call_soon_threadsafe(self, main_mocks):
        mock_loop, mock_server, mock_event, _ = main_mocks
        mock_loop.add_signal_handler = MagicMock(side_effect=NotImplementedError)
        mock_loop.call_soon_threadsafe = MagicMock()
        mock_event.wait = AsyncMock()

        captured_handlers: dict[int, object] = {}

        def _capture_signal(sig, handler):
            captured_handlers[sig] = handler

        with _patch_main(
            mock_loop,
            mock_server,
            mock_event,
            extra_patches=[patch("server.signal.signal", side_effect=_capture_signal)],
        ):
            await main()

        sigint_handler = captured_handlers[signal.SIGINT]
        assert callable(sigint_handler)
        sigint_handler(signal.SIGINT.value, None)
        mock_loop.call_soon_threadsafe.assert_called_once()


class TestTriggerMessageType:
    """Tests for configurable TriggerMessage type."""

    async def test_send_trigger_message_default_status_notification(
        self, command_charge_point
    ):
        """Verify default TriggerMessage type is status_notification."""
        command_charge_point.call = AsyncMock(
            return_value=ocpp.v201.call_result.TriggerMessage(
                status=TriggerMessageStatusEnumType.accepted
            )
        )
        await command_charge_point._send_trigger_message()
        call_args = command_charge_point.call.call_args
        request = call_args[0][0]
        assert request.requested_message == MessageTriggerEnumType.status_notification

    async def test_send_trigger_message_custom_boot_notification(self, mock_connection):
        """Verify custom TriggerMessage type is used."""
        cp = ChargePoint(
            mock_connection,
            trigger_message_type=MessageTriggerEnumType.boot_notification,
        )
        cp.call = AsyncMock(
            return_value=ocpp.v201.call_result.TriggerMessage(
                status=TriggerMessageStatusEnumType.accepted
            )
        )
        await cp._send_trigger_message()
        call_args = cp.call.call_args
        request = call_args[0][0]
        assert request.requested_message == MessageTriggerEnumType.boot_notification


class TestResetType:
    """Tests for configurable Reset type."""

    async def test_send_reset_default_immediate(self, command_charge_point):
        """Verify default Reset type is immediate."""
        command_charge_point.call = AsyncMock(
            return_value=ocpp.v201.call_result.Reset(
                status=ResetStatusEnumType.accepted
            )
        )
        await command_charge_point._send_reset()
        call_args = command_charge_point.call.call_args
        request = call_args[0][0]
        assert request.type == ResetEnumType.immediate

    async def test_send_reset_on_idle(self, mock_connection):
        """Verify custom Reset type is used."""
        cp = ChargePoint(mock_connection, reset_type=ResetEnumType.on_idle)
        cp.call = AsyncMock(
            return_value=ocpp.v201.call_result.Reset(
                status=ResetStatusEnumType.accepted
            )
        )
        await cp._send_reset()
        call_args = cp.call.call_args
        request = call_args[0][0]
        assert request.type == ResetEnumType.on_idle


class TestChangeAvailabilityStatus:
    """Tests for configurable ChangeAvailability status."""

    async def test_send_change_availability_default_operative(
        self, command_charge_point
    ):
        """Verify default ChangeAvailability status is operative."""
        command_charge_point.call = AsyncMock(
            return_value=ocpp.v201.call_result.ChangeAvailability(
                status=ChangeAvailabilityStatusEnumType.accepted
            )
        )
        await command_charge_point._send_change_availability()
        call_args = command_charge_point.call.call_args
        request = call_args[0][0]
        assert request.operational_status == OperationalStatusEnumType.operative

    async def test_send_change_availability_inoperative(self, mock_connection):
        """Verify custom ChangeAvailability status is used."""
        cp = ChargePoint(
            mock_connection,
            availability_status=OperationalStatusEnumType.inoperative,
        )
        cp.call = AsyncMock(
            return_value=ocpp.v201.call_result.ChangeAvailability(
                status=ChangeAvailabilityStatusEnumType.accepted
            )
        )
        await cp._send_change_availability()
        call_args = cp.call.call_args
        request = call_args[0][0]
        assert request.operational_status == OperationalStatusEnumType.inoperative


class TestCommandSequencing:
    """Tests for command sequencing (send_commands and _parse_commands)."""

    async def test_send_commands_executes_in_order(self, mock_connection):
        cp = ChargePoint(mock_connection)
        mock_send = AsyncMock()
        with patch.object(cp, "_send_command", mock_send):
            commands = [(Action.heartbeat, 0.001), (Action.clear_cache, 0.001)]
            await cp.send_commands(commands)
            assert mock_send.call_count == 2
            assert mock_send.call_args_list[0][0][0] == Action.heartbeat
            assert mock_send.call_args_list[1][0][0] == Action.clear_cache

    def test_parse_commands_valid(self):
        result = _parse_commands("Reset:5,ClearCache:10")
        assert result == [(Action.reset, 5.0), (Action.clear_cache, 10.0)]

    def test_parse_commands_invalid_format(self):
        with pytest.raises(argparse.ArgumentTypeError, match="expected 'CMD:DELAY'"):
            _parse_commands("ResetOnly")

    def test_parse_commands_unknown_action(self):
        with pytest.raises(argparse.ArgumentTypeError, match="Unknown action"):
            _parse_commands("UnknownAction:5")


class TestMultiVariableCommands:
    """Tests for multi-variable SetVariables/GetVariables CLI support."""

    def test_parse_set_variable_specs_valid(self):
        result = _parse_set_variable_specs(
            "OCPPCommCtrlr.HeartbeatInterval=30,TxCtrlr.EVConnectionTimeOut=60"
        )
        assert len(result) == 2
        assert result[0]["component"]["name"] == "OCPPCommCtrlr"
        assert result[0]["variable"]["name"] == "HeartbeatInterval"
        assert result[0]["attribute_value"] == "30"
        assert result[1]["component"]["name"] == "TxCtrlr"
        assert result[1]["variable"]["name"] == "EVConnectionTimeOut"
        assert result[1]["attribute_value"] == "60"

    def test_parse_get_variable_specs_valid(self):
        result = _parse_get_variable_specs(
            "ChargingStation.AvailabilityState,OCPPCommCtrlr.HeartbeatInterval"
        )
        assert len(result) == 2
        assert result[0]["component"]["name"] == "ChargingStation"
        assert result[0]["variable"]["name"] == "AvailabilityState"
        assert result[1]["component"]["name"] == "OCPPCommCtrlr"
        assert result[1]["variable"]["name"] == "HeartbeatInterval"

    def test_parse_set_variable_specs_invalid_no_dot(self):
        with pytest.raises(
            argparse.ArgumentTypeError,
            match=r"expected 'Component\.Variable=Value'",
        ):
            _parse_set_variable_specs("NoComponentVariable=30")

    async def test_send_set_variables_uses_custom_data(self, command_charge_point):
        custom_data = [
            {
                "component": {"name": "TestComp"},
                "variable": {"name": "TestVar"},
                "attribute_value": "42",
            }
        ]
        command_charge_point._set_variables_data = custom_data
        command_charge_point.call = AsyncMock(
            return_value=MagicMock(set_variable_result=[])
        )
        await command_charge_point._send_set_variables()
        call_args = command_charge_point.call.call_args[0][0]
        assert call_args.set_variable_data == custom_data
