"""Tests for the OCPP 1.6 mock server."""

import argparse
import contextlib
import logging
import signal
from datetime import datetime, timezone
from typing import Any, ClassVar
from unittest.mock import AsyncMock, MagicMock, patch

import ocpp.v16.call
import ocpp.v16.call_result
import pytest
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

from server16 import (
    DEFAULT_DIAGNOSTICS_URL,
    DEFAULT_FIRMWARE_URL,
    DEFAULT_HEARTBEAT_INTERVAL_SECONDS,
    DEFAULT_RESERVE_ID_TAG,
    DEFAULT_TEST_TOKEN,
    FALLBACK_TRANSACTION_ID,
    MAX_TRANSACTION_ID,
    AuthConfig,
    AuthMode,
    ChargePoint,
    ServerConfig,
    _log_signed_meter_values,
    _parse_commands,
    _random_transaction_id,
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
TEST_TRANSACTION_ID = 12345
TEST_CONNECTOR_ID = 1
TEST_VENDOR_ID = "TestVendor"
TEST_MODEL = "Test"
TEST_METER_START = 0
TEST_METER_STOP = 15000


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
            default_status=AuthorizationStatus.accepted,
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
            default_status=AuthorizationStatus.accepted,
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
            default_status=AuthorizationStatus.accepted,
        ),
    )


@pytest.fixture
def command_charge_point(mock_connection):
    """Create a ChargePoint with self.call mocked as AsyncMock."""
    cp = ChargePoint(mock_connection)
    cp.call = AsyncMock()
    return cp


@pytest.fixture
def mock_valid_ws():
    """Create a mock WebSocket with valid OCPP 1.6 subprotocol."""
    ws = MagicMock()
    ws.request = MagicMock()
    ws.request.headers = {"Sec-WebSocket-Protocol": "ocpp1.6"}
    ws.subprotocol = "ocpp1.6"
    ws.request.path = TEST_CHARGE_POINT_PATH
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
def _patch_main(
    mock_loop, mock_server, mock_event, extra_patches=None, **args_overrides
):
    args = argparse.Namespace(
        command=None,
        commands=None,
        delay=None,
        period=None,
        host="127.0.0.1",
        port=9000,
        connector_id=1,
        boot_status=None,
        boot_status_sequence=None,
        trigger_message=MessageTrigger.status_notification,
        reset_type=ResetType.hard,
        availability_type=AvailabilityType.operative,
        reserve_connector_id=1,
        reserve_id_tag=DEFAULT_RESERVE_ID_TAG,
        reservation_id=1,
        auth_mode="normal",
        whitelist=["valid_token"],
        blacklist=["blocked_token"],
        offline=False,
        auth_parent_id_tag=None,
    )
    for key, value in args_overrides.items():
        setattr(args, key, value)
    mock_serve_cm = AsyncMock()
    mock_serve_cm.__aenter__ = AsyncMock(return_value=mock_server)
    mock_serve_cm.__aexit__ = AsyncMock(return_value=False)

    patches = [
        patch(
            "server16.argparse.ArgumentParser.parse_known_args",
            return_value=(MagicMock(command=args.command), []),
        ),
        patch("server16.argparse.ArgumentParser.parse_args", return_value=args),
        patch("server16.websockets.serve", return_value=mock_serve_cm),
        patch("server16.asyncio.get_running_loop", return_value=mock_loop),
        patch("server16.asyncio.Event", return_value=mock_event),
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


class TestRandomTransactionId:
    """Tests for MAX_TRANSACTION_ID constant and _random_transaction_id helper."""

    def test_max_transaction_id_value(self):
        assert MAX_TRANSACTION_ID == 2**31 - 1

    def test_random_transaction_id_in_range(self):
        for _ in range(100):
            tid = _random_transaction_id()
            assert 1 <= tid <= MAX_TRANSACTION_ID

    def test_random_transaction_id_returns_int(self):
        assert isinstance(_random_transaction_id(), int)


class TestCommandSequencing:
    """Tests for command sequencing (send_commands and _parse_commands)."""

    async def test_send_commands_executes_in_order(self, mock_connection):
        cp = ChargePoint(mock_connection)
        mock_send = AsyncMock()
        with patch.object(cp, "_send_command", mock_send):
            commands = [(Action.trigger_message, 0.001), (Action.reset, 0.001)]
            await cp.send_commands(commands)
            assert mock_send.call_count == 2
            assert mock_send.call_args_list[0][0][0] == Action.trigger_message
            assert mock_send.call_args_list[1][0][0] == Action.reset

    def test_parse_commands_valid(self):
        result = _parse_commands("Reset:5,TriggerMessage:10")
        assert result == [(Action.reset, 5.0), (Action.trigger_message, 10.0)]

    def test_parse_commands_invalid_format(self):
        with pytest.raises(argparse.ArgumentTypeError, match="expected 'CMD:DELAY'"):
            _parse_commands("ResetOnly")

    def test_parse_commands_unknown_action(self):
        with pytest.raises(argparse.ArgumentTypeError, match="Unknown action"):
            _parse_commands("UnknownAction:5")

    def test_parse_commands_case_sensitive(self):
        with pytest.raises(argparse.ArgumentTypeError, match="Unknown action"):
            _parse_commands("reset:5")

    def test_parse_commands_infinite_delay(self):
        with pytest.raises(argparse.ArgumentTypeError, match="finite positive"):
            _parse_commands("Reset:inf")

    def test_parse_commands_nan_delay(self):
        with pytest.raises(argparse.ArgumentTypeError, match="finite positive"):
            _parse_commands("Reset:nan")

    def test_parse_commands_non_numeric_delay(self):
        with pytest.raises(argparse.ArgumentTypeError, match="must be a number"):
            _parse_commands("Reset:abc")

    def test_parse_commands_skips_empty_entries(self):
        result = _parse_commands("Reset:5,,ClearCache:10")
        assert result == [(Action.reset, 5.0), (Action.clear_cache, 10.0)]


class TestHandlerCoverage:
    """Tests verifying all expected OCPP 1.6 handlers and commands are implemented."""

    EXPECTED_INCOMING_HANDLERS: ClassVar[list[str]] = [
        "on_boot_notification",
        "on_authorize",
        "on_start_transaction",
        "on_stop_transaction",
        "on_meter_values",
        "on_status_notification",
        "on_heartbeat",
        "on_data_transfer",
        "on_firmware_status_notification",
        "on_diagnostics_status_notification",
    ]

    EXPECTED_OUTGOING_COMMANDS: ClassVar[list[str]] = [
        "_send_trigger_message",
        "_send_remote_start_transaction",
        "_send_remote_stop_transaction",
        "_send_reset",
        "_send_change_availability",
        "_send_update_firmware",
        "_send_get_diagnostics",
        "_send_reserve_now",
        "_send_cancel_reservation",
    ]

    @pytest.mark.parametrize("handler_name", EXPECTED_INCOMING_HANDLERS)
    def test_incoming_handler_exists(self, handler_name):
        assert hasattr(ChargePoint, handler_name), (
            f"Missing incoming handler: {handler_name}"
        )
        assert callable(getattr(ChargePoint, handler_name))
        on_action = getattr(getattr(ChargePoint, handler_name), "_on_action", None)
        assert on_action is not None, (
            f"Handler {handler_name} is not registered with an @on decorator"
        )
        expected_action = Action[handler_name.removeprefix("on_")]
        assert on_action == expected_action, (
            f"Handler {handler_name} routes {on_action}, expected {expected_action}"
        )

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
            default_status=AuthorizationStatus.accepted,
        )
        cp = ChargePoint(mock_connection, auth_config=config)
        assert cp._auth_config.mode == AuthMode.whitelist
        assert cp._auth_config.whitelist == ("token1",)

    def test_command_timer_initially_none(self, charge_point):
        assert charge_point._command_timer is None

    def test_default_boot_sequence(self, charge_point):
        assert charge_point._boot_sequence == (RegistrationStatus.accepted,)

    def test_custom_boot_sequence(self, mock_connection):
        cp = ChargePoint(
            mock_connection,
            boot_sequence=(RegistrationStatus.rejected,),
        )
        assert cp._boot_sequence == (RegistrationStatus.rejected,)

    def test_empty_boot_sequence_raises(self, mock_connection):
        with pytest.raises(ValueError, match="at least one status"):
            ChargePoint(mock_connection, boot_sequence=())


class TestResolveAuthStatus:
    """Tests for the _resolve_auth_status method."""

    def test_normal_mode_accepts(self, charge_point):
        status = charge_point._resolve_auth_status("any_token")
        assert status == AuthorizationStatus.accepted

    def test_whitelist_mode_accepts_valid_token(self, whitelist_charge_point):
        status = whitelist_charge_point._resolve_auth_status(TEST_VALID_TOKEN)
        assert status == AuthorizationStatus.accepted

    def test_whitelist_mode_blocks_unknown_token(self, whitelist_charge_point):
        status = whitelist_charge_point._resolve_auth_status("unknown_token")
        assert status == AuthorizationStatus.blocked

    def test_blacklist_mode_blocks_blacklisted_token(self, blacklist_charge_point):
        status = blacklist_charge_point._resolve_auth_status(TEST_BLOCKED_TOKEN)
        assert status == AuthorizationStatus.blocked

    def test_blacklist_mode_accepts_valid_token(self, blacklist_charge_point):
        status = blacklist_charge_point._resolve_auth_status("good_token")
        assert status == AuthorizationStatus.accepted

    def test_whitelist_blocks_empty_token(self, whitelist_charge_point):
        status = whitelist_charge_point._resolve_auth_status("")
        assert status == AuthorizationStatus.blocked

    def test_blacklist_accepts_empty_token(self, blacklist_charge_point):
        status = blacklist_charge_point._resolve_auth_status("")
        assert status == AuthorizationStatus.accepted


# --- Async handler tests ---


class TestBootNotificationHandler:
    """Tests for the BootNotification incoming handler."""

    async def test_returns_accepted_by_default(self, charge_point):
        response = await charge_point.on_boot_notification(
            charge_point_model=TEST_MODEL,
            charge_point_vendor=TEST_VENDOR_ID,
        )
        assert response.status == RegistrationStatus.accepted
        assert response.interval == DEFAULT_HEARTBEAT_INTERVAL_SECONDS
        assert isinstance(response.current_time, str)
        # current_time must be a parseable ISO-8601 UTC timestamp (consistent with the
        # Heartbeat handler contract), not merely a string containing "T".
        parsed = datetime.fromisoformat(response.current_time)
        assert parsed.tzinfo is not None

    async def test_configurable_boot_status(self, mock_connection):
        cp = ChargePoint(
            mock_connection,
            boot_sequence=(RegistrationStatus.rejected,),
        )
        response = await cp.on_boot_notification(
            charge_point_model=TEST_MODEL,
            charge_point_vendor=TEST_VENDOR_ID,
        )
        assert response.status == RegistrationStatus.rejected

    async def test_pending_boot_status(self, mock_connection):
        cp = ChargePoint(
            mock_connection,
            boot_sequence=(RegistrationStatus.pending,),
        )
        response = await cp.on_boot_notification(
            charge_point_model=TEST_MODEL,
            charge_point_vendor=TEST_VENDOR_ID,
        )
        assert response.status == RegistrationStatus.pending

    async def test_boot_notification_sequence_iterates(self, mock_connection):
        cp = ChargePoint(
            mock_connection,
            boot_sequence=(
                RegistrationStatus.pending,
                RegistrationStatus.pending,
                RegistrationStatus.accepted,
            ),
        )
        r1 = await cp.on_boot_notification(
            charge_point_model=TEST_MODEL, charge_point_vendor=TEST_VENDOR_ID
        )
        r2 = await cp.on_boot_notification(
            charge_point_model=TEST_MODEL, charge_point_vendor=TEST_VENDOR_ID
        )
        r3 = await cp.on_boot_notification(
            charge_point_model=TEST_MODEL, charge_point_vendor=TEST_VENDOR_ID
        )
        assert r1.status == RegistrationStatus.pending
        assert r2.status == RegistrationStatus.pending
        assert r3.status == RegistrationStatus.accepted

    async def test_boot_notification_sequence_clamps_to_last(self, mock_connection):
        cp = ChargePoint(
            mock_connection,
            boot_sequence=(
                RegistrationStatus.pending,
                RegistrationStatus.accepted,
            ),
        )
        for _ in range(3):
            response = await cp.on_boot_notification(
                charge_point_model=TEST_MODEL, charge_point_vendor=TEST_VENDOR_ID
            )
        assert response.status == RegistrationStatus.accepted


class TestHeartbeatHandler:
    """Tests for the Heartbeat incoming handler."""

    async def test_returns_current_time(self, charge_point):
        response = await charge_point.on_heartbeat()
        assert isinstance(response.current_time, str)
        # Real contract: current_time must be a parseable ISO-8601 timestamp (UTC),
        # not merely a string containing "T". datetime.fromisoformat raises on garbage.
        parsed = datetime.fromisoformat(response.current_time)
        assert parsed.tzinfo is not None
        # emitted "now" — within a generous window of the assertion time
        delta = abs((datetime.now(timezone.utc) - parsed).total_seconds())
        assert delta < 60


class TestStatusNotificationHandler:
    """Tests for the StatusNotification incoming handler."""

    async def test_returns_empty_response(self, charge_point):
        response = await charge_point.on_status_notification(
            connector_id=TEST_CONNECTOR_ID,
            error_code="NoError",
            status="Available",
        )
        assert isinstance(response, ocpp.v16.call_result.StatusNotification)
        assert response == ocpp.v16.call_result.StatusNotification()


class TestAuthorizeHandler:
    """Tests for the Authorize incoming handler."""

    async def test_normal_mode_accepts(self, charge_point):
        response = await charge_point.on_authorize(id_tag="any_token")
        assert response.id_tag_info["status"] == AuthorizationStatus.accepted

    async def test_whitelist_accepts_valid(self, whitelist_charge_point):
        response = await whitelist_charge_point.on_authorize(id_tag=TEST_VALID_TOKEN)
        assert response.id_tag_info["status"] == AuthorizationStatus.accepted

    async def test_whitelist_blocks_unknown(self, whitelist_charge_point):
        response = await whitelist_charge_point.on_authorize(id_tag="stranger")
        assert response.id_tag_info["status"] == AuthorizationStatus.blocked

    async def test_blacklist_blocks_blacklisted(self, blacklist_charge_point):
        response = await blacklist_charge_point.on_authorize(id_tag=TEST_BLOCKED_TOKEN)
        assert response.id_tag_info["status"] == AuthorizationStatus.blocked

    async def test_blacklist_accepts_unlisted(self, blacklist_charge_point):
        response = await blacklist_charge_point.on_authorize(id_tag="unlisted_token")
        assert response.id_tag_info["status"] == AuthorizationStatus.accepted

    async def test_offline_raises_internal_error(self, offline_charge_point):
        from ocpp.exceptions import InternalError

        with pytest.raises(InternalError):
            await offline_charge_point.on_authorize(id_tag="any")

    async def test_parent_id_tag_included(self, mock_connection):
        cp = ChargePoint(
            mock_connection,
            auth_config=AuthConfig(
                mode=AuthMode.normal,
                whitelist=(),
                blacklist=(),
                offline=False,
                default_status=AuthorizationStatus.accepted,
                parent_id_tag="ParentTag",
            ),
        )
        response = await cp.on_authorize(id_tag=TEST_TOKEN)
        assert response.id_tag_info["parent_id_tag"] == "ParentTag"

    async def test_parent_id_tag_absent_by_default(self, charge_point):
        response = await charge_point.on_authorize(id_tag=TEST_TOKEN)
        assert "parent_id_tag" not in response.id_tag_info


class TestStartTransactionHandler:
    """Tests for the StartTransaction incoming handler."""

    async def test_returns_transaction_id_and_id_tag_info(self, charge_point):
        response = await charge_point.on_start_transaction(
            connector_id=TEST_CONNECTOR_ID,
            id_tag=TEST_TOKEN,
            meter_start=TEST_METER_START,
            timestamp=TEST_TIMESTAMP,
        )
        assert isinstance(response, ocpp.v16.call_result.StartTransaction)
        assert isinstance(response.transaction_id, int)
        assert response.transaction_id > 0
        assert response.id_tag_info["status"] == AuthorizationStatus.accepted

    async def test_stores_active_transaction(self, charge_point):
        response = await charge_point.on_start_transaction(
            connector_id=TEST_CONNECTOR_ID,
            id_tag=TEST_TOKEN,
            meter_start=TEST_METER_START,
            timestamp=TEST_TIMESTAMP,
        )
        assert response.transaction_id in charge_point._active_transactions
        assert (
            charge_point._active_transactions[response.transaction_id]
            == TEST_CONNECTOR_ID
        )


class TestStopTransactionHandler:
    """Tests for the StopTransaction incoming handler."""

    async def test_returns_empty_when_no_id_tag(self, charge_point):
        response = await charge_point.on_stop_transaction(
            meter_stop=TEST_METER_STOP,
            timestamp=TEST_TIMESTAMP,
            transaction_id=TEST_TRANSACTION_ID,
        )
        assert isinstance(response, ocpp.v16.call_result.StopTransaction)
        assert response.id_tag_info is None

    async def test_returns_id_tag_info_when_id_tag_present(self, charge_point):
        response = await charge_point.on_stop_transaction(
            meter_stop=TEST_METER_STOP,
            timestamp=TEST_TIMESTAMP,
            transaction_id=TEST_TRANSACTION_ID,
            id_tag=TEST_TOKEN,
        )
        assert response.id_tag_info["status"] == AuthorizationStatus.accepted

    async def test_removes_active_transaction(self, charge_point):
        charge_point._active_transactions[TEST_TRANSACTION_ID] = TEST_CONNECTOR_ID
        await charge_point.on_stop_transaction(
            meter_stop=TEST_METER_STOP,
            timestamp=TEST_TIMESTAMP,
            transaction_id=TEST_TRANSACTION_ID,
        )
        assert TEST_TRANSACTION_ID not in charge_point._active_transactions

    async def test_detects_signed_transaction_data(self, charge_point, caplog):
        caplog.set_level(logging.INFO)
        transaction_data = [
            {
                "timestamp": TEST_TIMESTAMP,
                "sampled_value": [
                    {
                        "value": "signed_blob",
                        "format": ValueFormat.signed_data.value,
                        "measurand": "Energy.Active.Import.Register",
                        "context": "Transaction.End",
                    }
                ],
            }
        ]
        await charge_point.on_stop_transaction(
            meter_stop=TEST_METER_STOP,
            timestamp=TEST_TIMESTAMP,
            transaction_id=TEST_TRANSACTION_ID,
            transaction_data=transaction_data,
        )
        assert any("signed meter value" in r.message.lower() for r in caplog.records)


class TestNotificationHandlers:
    """Tests for notification incoming handlers with empty responses."""

    async def test_meter_values(self, charge_point):
        response = await charge_point.on_meter_values(
            connector_id=TEST_CONNECTOR_ID,
            meter_value=[{"timestamp": TEST_TIMESTAMP}],
        )
        # Empty-response contract: exact type AND no extra payload fields (equals a
        # fresh empty result — a regression adding stray fields would fail this).
        assert isinstance(response, ocpp.v16.call_result.MeterValues)
        assert response == ocpp.v16.call_result.MeterValues()

    async def test_meter_values_with_signed_meter_value(self, charge_point, caplog):
        caplog.set_level(logging.INFO)
        meter_value = [
            {
                "timestamp": TEST_TIMESTAMP,
                "sampled_value": [
                    {
                        "value": "signed_blob",
                        "format": ValueFormat.signed_data.value,
                        "measurand": "Energy.Active.Import.Register",
                        "context": "Sample.Periodic",
                    }
                ],
            }
        ]
        response = await charge_point.on_meter_values(
            connector_id=TEST_CONNECTOR_ID, meter_value=meter_value
        )
        assert isinstance(response, ocpp.v16.call_result.MeterValues)
        assert any("signed meter value" in r.message.lower() for r in caplog.records)

    async def test_data_transfer(self, charge_point):
        response = await charge_point.on_data_transfer(vendor_id=TEST_VENDOR_ID)
        assert response.status == DataTransferStatus.accepted

    async def test_firmware_status_notification(self, charge_point):
        response = await charge_point.on_firmware_status_notification(
            status="Installed"
        )
        assert isinstance(response, ocpp.v16.call_result.FirmwareStatusNotification)
        assert response == ocpp.v16.call_result.FirmwareStatusNotification()

    async def test_diagnostics_status_notification(self, charge_point):
        response = await charge_point.on_diagnostics_status_notification(
            status="Uploaded"
        )
        assert isinstance(response, ocpp.v16.call_result.DiagnosticsStatusNotification)
        assert response == ocpp.v16.call_result.DiagnosticsStatusNotification()


class TestLogSignedMeterValues:
    """Tests for the _log_signed_meter_values helper."""

    def test_logs_signed_data(self, caplog):
        caplog.set_level(logging.INFO)
        meter_value = [
            {
                "sampled_value": [
                    {
                        "value": "blob",
                        "format": ValueFormat.signed_data.value,
                        "measurand": "Energy.Active.Import.Register",
                        "context": "Sample.Periodic",
                    }
                ],
            }
        ]
        _log_signed_meter_values(meter_value)
        assert any("signed meter value" in r.message.lower() for r in caplog.records)

    def test_ignores_unsigned_data(self, caplog):
        caplog.set_level(logging.INFO)
        meter_value = [
            {
                "sampled_value": [
                    {
                        "value": "10.5",
                        "measurand": "Energy.Active.Import.Register",
                    }
                ],
            }
        ]
        _log_signed_meter_values(meter_value)
        assert not any(
            "signed meter value" in r.message.lower() for r in caplog.records
        )

    def test_empty_list_no_error(self, caplog):
        caplog.set_level(logging.INFO)
        _log_signed_meter_values([])
        assert not any(
            "signed meter value" in r.message.lower() for r in caplog.records
        )


class TestOutgoingCommands:
    """Behavioral tests for the _send_* outgoing command methods."""

    async def test_send_trigger_message(self, command_charge_point):
        command_charge_point.call.return_value = ocpp.v16.call_result.TriggerMessage(
            status=TriggerMessageStatus.accepted
        )
        await command_charge_point._send_trigger_message()
        command_charge_point.call.assert_called_once()
        request = command_charge_point.call.call_args[0][0]
        assert isinstance(request, ocpp.v16.call.TriggerMessage)
        assert request.requested_message == MessageTrigger.status_notification
        assert request.connector_id == command_charge_point._connector_id

    async def test_send_trigger_message_custom_type(self, mock_connection):
        cp = ChargePoint(
            mock_connection,
            trigger_message_type=MessageTrigger.boot_notification,
        )
        cp.call = AsyncMock(
            return_value=ocpp.v16.call_result.TriggerMessage(
                status=TriggerMessageStatus.accepted
            )
        )
        await cp._send_trigger_message()
        request = cp.call.call_args[0][0]
        assert request.requested_message == MessageTrigger.boot_notification

    async def test_send_remote_start_transaction(self, command_charge_point):
        command_charge_point.call.return_value = (
            ocpp.v16.call_result.RemoteStartTransaction(
                status=RemoteStartStopStatus.accepted
            )
        )
        await command_charge_point._send_remote_start_transaction()
        command_charge_point.call.assert_called_once()
        request = command_charge_point.call.call_args[0][0]
        assert isinstance(request, ocpp.v16.call.RemoteStartTransaction)
        assert request.id_tag == DEFAULT_TEST_TOKEN
        assert request.connector_id == command_charge_point._connector_id

    async def test_send_remote_stop_transaction_fallback(self, command_charge_point):
        command_charge_point.call.return_value = (
            ocpp.v16.call_result.RemoteStopTransaction(
                status=RemoteStartStopStatus.accepted
            )
        )
        await command_charge_point._send_remote_stop_transaction()
        command_charge_point.call.assert_called_once()
        request = command_charge_point.call.call_args[0][0]
        assert isinstance(request, ocpp.v16.call.RemoteStopTransaction)
        assert request.transaction_id == FALLBACK_TRANSACTION_ID

    async def test_send_remote_stop_transaction_uses_active(self, command_charge_point):
        command_charge_point._active_transactions[999] = TEST_CONNECTOR_ID
        command_charge_point.call.return_value = (
            ocpp.v16.call_result.RemoteStopTransaction(
                status=RemoteStartStopStatus.accepted
            )
        )
        await command_charge_point._send_remote_stop_transaction()
        request = command_charge_point.call.call_args[0][0]
        assert request.transaction_id == 999

    async def test_send_reset(self, command_charge_point):
        command_charge_point.call.return_value = ocpp.v16.call_result.Reset(
            status=ResetStatus.accepted
        )
        await command_charge_point._send_reset()
        command_charge_point.call.assert_called_once()
        request = command_charge_point.call.call_args[0][0]
        assert isinstance(request, ocpp.v16.call.Reset)
        assert request.type == ResetType.hard

    async def test_send_reset_soft(self, mock_connection):
        cp = ChargePoint(mock_connection, reset_type=ResetType.soft)
        cp.call = AsyncMock(
            return_value=ocpp.v16.call_result.Reset(status=ResetStatus.accepted)
        )
        await cp._send_reset()
        request = cp.call.call_args[0][0]
        assert request.type == ResetType.soft

    async def test_send_change_availability(self, command_charge_point):
        command_charge_point.call.return_value = (
            ocpp.v16.call_result.ChangeAvailability(status=AvailabilityStatus.accepted)
        )
        await command_charge_point._send_change_availability()
        command_charge_point.call.assert_called_once()
        request = command_charge_point.call.call_args[0][0]
        assert isinstance(request, ocpp.v16.call.ChangeAvailability)
        assert request.connector_id == command_charge_point._connector_id
        assert request.type == AvailabilityType.operative

    async def test_send_change_availability_inoperative(self, mock_connection):
        cp = ChargePoint(
            mock_connection,
            availability_type=AvailabilityType.inoperative,
        )
        cp.call = AsyncMock(
            return_value=ocpp.v16.call_result.ChangeAvailability(
                status=AvailabilityStatus.accepted
            )
        )
        await cp._send_change_availability()
        request = cp.call.call_args[0][0]
        assert request.type == AvailabilityType.inoperative

    async def test_send_update_firmware(self, command_charge_point):
        command_charge_point.call.return_value = ocpp.v16.call_result.UpdateFirmware()
        await command_charge_point._send_update_firmware()
        command_charge_point.call.assert_called_once()
        request = command_charge_point.call.call_args[0][0]
        assert isinstance(request, ocpp.v16.call.UpdateFirmware)
        assert request.location == DEFAULT_FIRMWARE_URL
        assert isinstance(request.retrieve_date, str)

    async def test_send_get_diagnostics(self, command_charge_point):
        command_charge_point.call.return_value = ocpp.v16.call_result.GetDiagnostics(
            file_name="diag.log"
        )
        await command_charge_point._send_get_diagnostics()
        command_charge_point.call.assert_called_once()
        request = command_charge_point.call.call_args[0][0]
        assert isinstance(request, ocpp.v16.call.GetDiagnostics)
        assert request.location == DEFAULT_DIAGNOSTICS_URL

    async def test_send_reserve_now(self, command_charge_point):
        command_charge_point.call.return_value = ocpp.v16.call_result.ReserveNow(
            status=ReservationStatus.accepted
        )
        await command_charge_point._send_reserve_now()
        command_charge_point.call.assert_called_once()
        request = command_charge_point.call.call_args[0][0]
        assert isinstance(request, ocpp.v16.call.ReserveNow)
        assert request.connector_id == command_charge_point._reserve_connector_id
        assert request.id_tag == DEFAULT_RESERVE_ID_TAG
        assert request.reservation_id == command_charge_point._reservation_id
        assert isinstance(request.expiry_date, str)

    async def test_send_cancel_reservation(self, command_charge_point):
        command_charge_point.call.return_value = ocpp.v16.call_result.CancelReservation(
            status=CancelReservationStatus.accepted
        )
        await command_charge_point._send_cancel_reservation()
        command_charge_point.call.assert_called_once()
        request = command_charge_point.call.call_args[0][0]
        assert isinstance(request, ocpp.v16.call.CancelReservation)
        assert request.reservation_id == command_charge_point._reservation_id

    FAILURE_PATH_CASES: ClassVar[list[tuple[str, type, object]]] = [
        (
            "_send_trigger_message",
            ocpp.v16.call_result.TriggerMessage,
            TriggerMessageStatus.rejected,
        ),
        (
            "_send_remote_start_transaction",
            ocpp.v16.call_result.RemoteStartTransaction,
            RemoteStartStopStatus.rejected,
        ),
        (
            "_send_remote_stop_transaction",
            ocpp.v16.call_result.RemoteStopTransaction,
            RemoteStartStopStatus.rejected,
        ),
        (
            "_send_reset",
            ocpp.v16.call_result.Reset,
            ResetStatus.rejected,
        ),
        (
            "_send_change_availability",
            ocpp.v16.call_result.ChangeAvailability,
            AvailabilityStatus.rejected,
        ),
        (
            "_send_reserve_now",
            ocpp.v16.call_result.ReserveNow,
            ReservationStatus.rejected,
        ),
        (
            "_send_cancel_reservation",
            ocpp.v16.call_result.CancelReservation,
            CancelReservationStatus.rejected,
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


class TestSendCommandErrorHandling:
    """Tests for error handling in the command dispatch layer."""

    async def test_timeout_is_caught(self, charge_point, caplog):
        caplog.set_level(logging.ERROR)
        with patch.object(
            charge_point, "_send_reset", side_effect=TimeoutError("timed out")
        ):
            await charge_point._send_command(command_name=Action.reset)
        assert any(
            r.levelno == logging.ERROR and "timeout waiting for" in r.message.lower()
            for r in caplog.records
        )

    async def test_ocpp_error_is_caught(self, charge_point, caplog):
        from ocpp.exceptions import InternalError as OCPPInternalError

        caplog.set_level(logging.ERROR)
        with patch.object(
            charge_point,
            "_send_reset",
            side_effect=OCPPInternalError(description="test error"),
        ):
            await charge_point._send_command(command_name=Action.reset)
        assert any(
            r.levelno == logging.ERROR
            and "ocpp error sending" in r.message.lower()
            and "test error" in r.message
            for r in caplog.records
        )

    async def test_connection_closed_is_caught(self, charge_point):
        from websockets.exceptions import ConnectionClosedOK
        from websockets.frames import Close

        with (
            patch.object(
                charge_point,
                "_send_reset",
                side_effect=ConnectionClosedOK(
                    Close(1000, ""), Close(1000, ""), rcvd_then_sent=True
                ),
            ),
            patch.object(charge_point, "handle_connection_closed"),
        ):
            await charge_point._send_command(command_name=Action.reset)
            charge_point.handle_connection_closed.assert_called_once()

    async def test_unexpected_error_is_caught(self, charge_point, caplog):
        caplog.set_level(logging.ERROR)
        with patch.object(
            charge_point, "_send_reset", side_effect=RuntimeError("boom")
        ):
            await charge_point._send_command(command_name=Action.reset)
        assert any(
            r.levelno == logging.ERROR
            and "unexpected error sending" in r.message.lower()
            for r in caplog.records
        )

    async def test_unsupported_command_logs_warning(self, charge_point, caplog):
        caplog.set_level(logging.WARNING)
        unsupported = MagicMock(value="Unsupported")
        await charge_point._send_command(command_name=unsupported)
        assert any("not supported" in r.message.lower() for r in caplog.records)


class TestSendCommand:
    """Tests for Timer creation logic in send_command."""

    async def test_delay_creates_one_shot_timer(self, charge_point):
        with patch("server16.Timer") as MockTimer:
            MockTimer.return_value = MagicMock()
            await charge_point.send_command(Action.reset, delay=1.0, period=None)
            MockTimer.assert_called_once()
            args = MockTimer.call_args[0]
            assert args[0] == 1.0
            assert args[1] is False

    async def test_period_creates_repeating_timer(self, charge_point):
        with patch("server16.Timer") as MockTimer:
            MockTimer.return_value = MagicMock()
            await charge_point.send_command(Action.reset, delay=None, period=1.0)
            MockTimer.assert_called_once()
            args = MockTimer.call_args[0]
            assert args[0] == 1.0
            assert args[1] is True

    async def test_no_timer_when_both_none(self, charge_point):
        with patch("server16.Timer") as MockTimer:
            await charge_point.send_command(Action.reset, delay=None, period=None)
            MockTimer.assert_not_called()

    async def test_second_call_no_op_when_timer_exists(self, charge_point):
        charge_point._command_timer = MagicMock()
        with patch("server16.Timer") as MockTimer:
            await charge_point.send_command(Action.reset, delay=1.0, period=None)
            MockTimer.assert_not_called()


class TestHandleConnectionClosed:
    """Tests for the handle_connection_closed cleanup method."""

    def test_timer_cancelled_on_close(self, charge_point):
        mock_timer = MagicMock()
        charge_point._command_timer = mock_timer
        charge_point.handle_connection_closed()
        mock_timer.cancel.assert_called_once()

    def test_commands_task_cancelled_on_close(self, charge_point):
        mock_task = MagicMock()
        charge_point._commands_task = mock_task
        charge_point.handle_connection_closed()
        mock_task.cancel.assert_called_once()

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
                default_status=AuthorizationStatus.accepted,
            ),
            "boot_sequence": (RegistrationStatus.accepted,),
            "connector_id": TEST_CONNECTOR_ID,
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
        # Behavioural contract: a rejected connection must NOT register a charge point.
        assert len(config.charge_points) == 0

    async def test_protocol_mismatch_closes_connection(self):
        mock_ws = MagicMock()
        mock_ws.request = MagicMock()
        mock_ws.request.headers = {"Sec-WebSocket-Protocol": "ocpp1.6"}
        mock_ws.subprotocol = None
        mock_ws.close = AsyncMock()
        config = self._make_config()

        await on_connect(mock_ws, config=config)
        mock_ws.close.assert_called_once()
        assert len(config.charge_points) == 0

    async def test_successful_connection_creates_charge_point(self, mock_valid_ws):
        config = self._make_config()

        with patch("server16.ChargePoint") as MockCP:
            mock_cp = AsyncMock()
            MockCP.return_value = mock_cp
            await on_connect(mock_valid_ws, config=config)
            mock_cp.start.assert_called_once()

    async def test_connection_closed_during_start_triggers_cleanup(self, mock_valid_ws):
        from websockets.exceptions import ConnectionClosedOK
        from websockets.frames import Close

        config = self._make_config()
        exc = ConnectionClosedOK(Close(1000, ""), Close(1000, ""), rcvd_then_sent=True)

        with patch("server16.ChargePoint") as MockCP:
            mock_cp = AsyncMock()
            mock_cp.start = AsyncMock(side_effect=exc)
            mock_cp.handle_connection_closed = MagicMock()
            MockCP.return_value = mock_cp
            await on_connect(mock_valid_ws, config=config)
            mock_cp.handle_connection_closed.assert_called_once()

    async def test_command_sent_on_connect_when_specified(self, mock_valid_ws):
        config = self._make_config(command_name=Action.reset, delay=1.0, period=None)

        with patch("server16.ChargePoint") as MockCP:
            mock_cp = AsyncMock()
            MockCP.return_value = mock_cp
            await on_connect(mock_valid_ws, config=config)
            mock_cp.send_command.assert_called_once_with(Action.reset, 1.0, None)

    async def test_commands_sequence_scheduled_on_connect(self, mock_valid_ws):
        config = self._make_config(commands=[(Action.reset, 1.0)])

        with (
            patch("server16.ChargePoint") as MockCP,
            patch("server16.asyncio.create_task") as mock_create_task,
        ):
            mock_cp = AsyncMock()
            mock_cp.send_commands = MagicMock()
            MockCP.return_value = mock_cp
            await on_connect(mock_valid_ws, config=config)
            mock_create_task.assert_called_once()


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

    async def test_windows_handler_schedules_via_call_soon_threadsafe(self, main_mocks):
        mock_loop, mock_server, mock_event, _ = main_mocks
        mock_loop.add_signal_handler = MagicMock(side_effect=NotImplementedError)
        mock_loop.call_soon_threadsafe = MagicMock()
        mock_event.wait = AsyncMock()

        captured_handlers: dict[int, Any] = {}

        def _capture_signal(sig: int, handler: Any) -> None:
            captured_handlers[sig] = handler

        with _patch_main(
            mock_loop,
            mock_server,
            mock_event,
            extra_patches=[patch("_common.signal.signal", side_effect=_capture_signal)],
        ):
            await main()

        sigint_handler = captured_handlers[signal.SIGINT]
        assert callable(sigint_handler)
        sigint_handler(signal.SIGINT.value, None)
        mock_loop.call_soon_threadsafe.assert_called_once()

    async def test_windows_fallback_registers_signal_handlers(self, main_mocks):
        mock_loop, mock_server, mock_event, _ = main_mocks
        mock_loop.add_signal_handler = MagicMock(side_effect=NotImplementedError)
        mock_event.wait = AsyncMock()

        mock_signal_fn = MagicMock()

        with _patch_main(
            mock_loop,
            mock_server,
            mock_event,
            extra_patches=[patch("_common.signal.signal", mock_signal_fn)],
        ):
            await main()

        assert mock_signal_fn.call_count == 2
        registered_signals = {call.args[0] for call in mock_signal_fn.call_args_list}
        assert registered_signals == {signal.SIGINT, signal.SIGTERM}

    async def test_boot_status_sequence_parsed(self, main_mocks):
        mock_loop, mock_server, mock_event, signal_handlers = main_mocks

        async def _fire_sigint():
            handler, args = signal_handlers[signal.SIGINT]
            handler(*args)

        mock_event.wait = AsyncMock(side_effect=_fire_sigint)

        captured: dict[str, ServerConfig] = {}
        real_server_config = ServerConfig

        def _capture_server_config(*args, **kwargs):
            config = real_server_config(*args, **kwargs)
            captured["config"] = config
            return config

        with _patch_main(
            mock_loop,
            mock_server,
            mock_event,
            extra_patches=[
                patch("server16.ServerConfig", side_effect=_capture_server_config)
            ],
            boot_status_sequence="Pending,Accepted",
        ):
            await main()

        mock_server.close.assert_called_once()
        assert captured["config"].boot_sequence == (
            RegistrationStatus.pending,
            RegistrationStatus.accepted,
        )

    async def test_boot_status_single_value(self, main_mocks):
        mock_loop, mock_server, mock_event, signal_handlers = main_mocks

        async def _fire_sigint():
            handler, args = signal_handlers[signal.SIGINT]
            handler(*args)

        mock_event.wait = AsyncMock(side_effect=_fire_sigint)

        captured: dict[str, ServerConfig] = {}
        real_server_config = ServerConfig

        def _capture_server_config(*args, **kwargs):
            config = real_server_config(*args, **kwargs)
            captured["config"] = config
            return config

        with _patch_main(
            mock_loop,
            mock_server,
            mock_event,
            extra_patches=[
                patch("server16.ServerConfig", side_effect=_capture_server_config)
            ],
            boot_status=RegistrationStatus.rejected,
        ):
            await main()

        mock_server.close.assert_called_once()
        assert captured["config"].boot_sequence == (RegistrationStatus.rejected,)
