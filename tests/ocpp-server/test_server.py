"""Tests for the OCPP 2.0.1 mock server."""

import argparse
import logging
from typing import ClassVar
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
    _random_request_id,
    check_positive_number,
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

    def test_rate_limit_mode(self, mock_connection):
        cp = ChargePoint(
            mock_connection,
            auth_config=AuthConfig(
                mode=AuthMode.rate_limit,
                whitelist=(),
                blacklist=(),
                offline=False,
                default_status=AuthorizationStatusEnumType.accepted,
            ),
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
        assert isinstance(response.current_time, str)
        assert "T" in response.current_time

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
        assert "failed" in caplog.text.lower()


class TestOnConnect:
    """Tests for the on_connect WebSocket connection handler."""

    @staticmethod
    def _make_config(**overrides):
        """Create a minimal ServerConfig for testing."""
        defaults = {
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
            "boot_status": RegistrationStatusEnumType.accepted,
            "total_cost": 0.0,
            "charge_points": set(),
        }
        defaults.update(overrides)
        return ServerConfig(**defaults)

    async def test_missing_subprotocol_header_closes_connection(self):
        mock_ws = MagicMock()
        mock_ws.request_headers = {}
        mock_ws.close = AsyncMock()
        config = self._make_config()

        await on_connect(mock_ws, config=config)
        mock_ws.close.assert_called_once()

    async def test_protocol_mismatch_closes_connection(self):
        mock_ws = MagicMock()
        mock_ws.request_headers = {"Sec-WebSocket-Protocol": "ocpp1.6"}
        mock_ws.subprotocol = None
        mock_ws.close = AsyncMock()
        config = self._make_config()

        await on_connect(mock_ws, config=config)
        mock_ws.close.assert_called_once()

    async def test_successful_connection_creates_charge_point(self):
        mock_ws = MagicMock()
        mock_ws.request_headers = {"Sec-WebSocket-Protocol": "ocpp2.0.1"}
        mock_ws.subprotocol = "ocpp2.0.1"
        mock_ws.path = "/TestCP"
        mock_ws.close = AsyncMock()
        config = self._make_config()

        with patch("server.ChargePoint") as MockCP:
            mock_cp = AsyncMock()
            MockCP.return_value = mock_cp
            await on_connect(mock_ws, config=config)
            mock_cp.start.assert_called_once()

    async def test_connection_closed_during_start_triggers_cleanup(self):
        from websockets.exceptions import ConnectionClosedOK
        from websockets.frames import Close

        mock_ws = MagicMock()
        mock_ws.request_headers = {"Sec-WebSocket-Protocol": "ocpp2.0.1"}
        mock_ws.subprotocol = "ocpp2.0.1"
        mock_ws.path = "/TestCP"
        mock_ws.close = AsyncMock()
        config = self._make_config()

        exc = ConnectionClosedOK(Close(1000, ""), Close(1000, ""), rcvd_then_sent=True)

        with patch("server.ChargePoint") as MockCP:
            mock_cp = AsyncMock()
            mock_cp.start = AsyncMock(side_effect=exc)
            mock_cp.handle_connection_closed = MagicMock()
            MockCP.return_value = mock_cp
            await on_connect(mock_ws, config=config)
            mock_cp.handle_connection_closed.assert_called_once()

    async def test_command_sent_on_connect_when_specified(self):
        mock_ws = MagicMock()
        mock_ws.request_headers = {"Sec-WebSocket-Protocol": "ocpp2.0.1"}
        mock_ws.subprotocol = "ocpp2.0.1"
        mock_ws.path = "/TestCP"
        mock_ws.close = AsyncMock()
        config = self._make_config(
            command_name=Action.clear_cache, delay=1.0, period=None
        )

        with patch("server.ChargePoint") as MockCP:
            mock_cp = AsyncMock()
            MockCP.return_value = mock_cp
            await on_connect(mock_ws, config=config)
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
