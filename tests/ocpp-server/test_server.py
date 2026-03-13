"""Tests for the OCPP 2.0.1 mock server."""

import argparse
from typing import ClassVar
from unittest.mock import MagicMock

import pytest
from ocpp.v201.enums import AuthorizationStatusEnumType

from server import ChargePoint, check_positive_number


@pytest.fixture
def mock_connection():
    """Create a mock WebSocket connection for ChargePoint instantiation."""
    conn = MagicMock()
    conn.path = "/TestChargePoint"
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
            "whitelist": ["valid_token", "test_token"],
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
            "blacklist": ["blocked_token"],
            "offline": False,
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
        status = whitelist_charge_point._resolve_auth_status("valid_token")
        assert status == AuthorizationStatusEnumType.accepted

    def test_whitelist_mode_blocks_unknown_token(self, whitelist_charge_point):
        status = whitelist_charge_point._resolve_auth_status("unknown_token")
        assert status == AuthorizationStatusEnumType.blocked

    def test_blacklist_mode_blocks_blacklisted_token(self, blacklist_charge_point):
        status = blacklist_charge_point._resolve_auth_status("blocked_token")
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

    def test_incoming_handler_count(self):
        """Verify no handlers were accidentally removed."""
        handler_count = sum(
            1
            for name in dir(ChargePoint)
            if name.startswith("on_") and callable(getattr(ChargePoint, name))
        )
        assert handler_count >= len(self.EXPECTED_INCOMING_HANDLERS)

    def test_outgoing_command_count(self):
        """Verify no outgoing commands were accidentally removed."""
        command_count = sum(
            1
            for name in dir(ChargePoint)
            if name.startswith("_send_") and callable(getattr(ChargePoint, name))
        )
        assert command_count >= len(self.EXPECTED_OUTGOING_COMMANDS)


class TestChargePointDefaultConfig:
    """Tests for ChargePoint default configuration."""

    def test_default_auth_config(self, charge_point):
        assert charge_point._auth_config["mode"] == "normal"
        assert charge_point._auth_config["offline"] is False
        assert "valid_token" in charge_point._auth_config["whitelist"]
        assert "blocked_token" in charge_point._auth_config["blacklist"]

    def test_custom_auth_config(self, mock_connection):
        config = {"mode": "whitelist", "whitelist": ["token1"]}
        cp = ChargePoint(mock_connection, auth_config=config)
        assert cp._auth_config["mode"] == "whitelist"
        assert cp._auth_config["whitelist"] == ["token1"]

    def test_command_timer_initially_none(self, charge_point):
        assert charge_point._command_timer is None
