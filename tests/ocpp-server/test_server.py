"""Tests for the OCPP 2.0.1 mock server."""

import argparse
from typing import ClassVar
from unittest.mock import MagicMock, patch

import ocpp.v201.call_result
import pytest
from ocpp.v201.enums import (
    AuthorizationStatusEnumType,
    DataTransferStatusEnumType,
    GenericStatusEnumType,
    GetCertificateStatusEnumType,
    Iso15118EVCertificateStatusEnumType,
    RegistrationStatusEnumType,
    TransactionEventEnumType,
)

from server import (
    DEFAULT_HEARTBEAT_INTERVAL,
    DEFAULT_TOTAL_COST,
    AuthConfig,
    AuthMode,
    ChargePoint,
    check_positive_number,
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
    conn.path = TEST_CHARGE_POINT_PATH
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
        auth_config={
            "mode": "whitelist",
            "whitelist": [TEST_VALID_TOKEN, TEST_TOKEN],
            "blacklist": [],
            "offline": False,
            "default_status": AuthorizationStatusEnumType.accepted,
        },
    )


@pytest.fixture
def blacklist_charge_point(mock_connection):
    """Create a ChargePoint with blacklist auth mode."""
    return ChargePoint(
        mock_connection,
        auth_config={
            "mode": "blacklist",
            "whitelist": [],
            "blacklist": [TEST_BLOCKED_TOKEN],
            "offline": False,
            "default_status": AuthorizationStatusEnumType.accepted,
        },
    )


@pytest.fixture
def offline_charge_point(mock_connection):
    """Create a ChargePoint with offline mode enabled."""
    return ChargePoint(
        mock_connection,
        auth_config={
            "mode": "normal",
            "whitelist": [],
            "blacklist": [],
            "offline": True,
            "default_status": AuthorizationStatusEnumType.accepted,
        },
    )


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

    def test_rate_limit_mode(self, mock_connection):
        cp = ChargePoint(
            mock_connection,
            auth_config={
                "mode": "rate_limit",
                "whitelist": [],
                "blacklist": [],
                "offline": False,
                "default_status": AuthorizationStatusEnumType.accepted,
            },
        )
        status = cp._resolve_auth_status("any_token")
        assert status == AuthorizationStatusEnumType.not_at_this_time


class TestChargePointHandlerCoverage:
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
        assert charge_point._auth_config["mode"] == "normal"
        assert charge_point._auth_config["offline"] is False
        assert TEST_VALID_TOKEN in charge_point._auth_config["whitelist"]
        assert TEST_BLOCKED_TOKEN in charge_point._auth_config["blacklist"]

    def test_custom_auth_config(self, mock_connection):
        config = {"mode": "whitelist", "whitelist": ["token1"]}
        cp = ChargePoint(mock_connection, auth_config=config)
        assert cp._auth_config["mode"] == "whitelist"
        assert cp._auth_config["whitelist"] == ["token1"]

    def test_command_timer_initially_none(self, charge_point):
        assert charge_point._command_timer is None

    def test_default_boot_status(self, charge_point):
        assert charge_point._boot_status == RegistrationStatusEnumType.accepted

    def test_custom_boot_status(self, mock_connection):
        cp = ChargePoint(
            mock_connection, boot_status=RegistrationStatusEnumType.rejected
        )
        assert cp._boot_status == RegistrationStatusEnumType.rejected

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
        assert response.current_time is not None

    async def test_configurable_boot_status(self, mock_connection):
        cp = ChargePoint(
            mock_connection, boot_status=RegistrationStatusEnumType.rejected
        )
        response = await cp.on_boot_notification(
            charging_station={"model": TEST_MODEL, "vendor_name": TEST_VENDOR_NAME},
            reason="PowerUp",
        )
        assert response.status == RegistrationStatusEnumType.rejected

    async def test_pending_boot_status(self, mock_connection):
        cp = ChargePoint(
            mock_connection, boot_status=RegistrationStatusEnumType.pending
        )
        response = await cp.on_boot_notification(
            charging_station={"model": TEST_MODEL, "vendor_name": TEST_VENDOR_NAME},
            reason="PowerUp",
        )
        assert response.status == RegistrationStatusEnumType.pending


class TestHeartbeatHandler:
    """Tests for the Heartbeat incoming handler."""

    async def test_returns_current_time(self, charge_point):
        response = await charge_point.on_heartbeat()
        assert response.current_time is not None
        assert len(response.current_time) > 0
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

    async def test_blacklist_blocks_blacklisted(self, mock_connection):
        auth_config = AuthConfig(
            mode=AuthMode.blacklist,
            whitelist=(),
            blacklist=(TEST_BLOCKED_TOKEN,),
            offline=False,
            default_status=AuthorizationStatusEnumType.accepted,
        )
        cp = ChargePoint(mock_connection, auth_config=auth_config)
        response = await cp.on_authorize(
            id_token={"id_token": TEST_BLOCKED_TOKEN, "type": "ISO14443"}
        )
        assert response.id_token_info["status"] == AuthorizationStatusEnumType.blocked

    async def test_blacklist_accepts_unlisted(self, mock_connection):
        auth_config = AuthConfig(
            mode=AuthMode.blacklist,
            whitelist=(),
            blacklist=(TEST_BLOCKED_TOKEN,),
            offline=False,
            default_status=AuthorizationStatusEnumType.accepted,
        )
        cp = ChargePoint(mock_connection, auth_config=auth_config)
        response = await cp.on_authorize(
            id_token={"id_token": "unlisted_token", "type": "ISO14443"}
        )
        assert response.id_token_info["status"] == AuthorizationStatusEnumType.accepted

    async def test_rate_limit_rejects(self, mock_connection):
        auth_config = AuthConfig(
            mode=AuthMode.rate_limit,
            whitelist=(),
            blacklist=(),
            offline=False,
            default_status=AuthorizationStatusEnumType.accepted,
        )
        cp = ChargePoint(mock_connection, auth_config=auth_config)
        response = await cp.on_authorize(
            id_token={"id_token": "any_token", "type": "ISO14443"}
        )
        assert (
            response.id_token_info["status"]
            == AuthorizationStatusEnumType.not_at_this_time
        )


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


class TestDataTransferHandler:
    """Tests for the DataTransfer incoming handler."""

    async def test_returns_accepted(self, charge_point):
        response = await charge_point.on_data_transfer(vendor_id=TEST_VENDOR_ID)
        assert response.status == DataTransferStatusEnumType.accepted


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
        from ocpp.v201.enums import Action

        with patch.object(
            charge_point, "_send_clear_cache", side_effect=TimeoutError("timed out")
        ):
            await charge_point._send_command(command_name=Action.clear_cache)

    async def test_ocpp_error_is_caught(self, charge_point):
        from ocpp.exceptions import InternalError as OCPPInternalError
        from ocpp.v201.enums import Action

        with patch.object(
            charge_point,
            "_send_clear_cache",
            side_effect=OCPPInternalError(description="test error"),
        ):
            await charge_point._send_command(command_name=Action.clear_cache)

    async def test_connection_closed_is_caught(self, charge_point):
        from ocpp.v201.enums import Action
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
