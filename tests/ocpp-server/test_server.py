#!/usr/bin/env python3
"""
Test script to verify OCPP 2.0 commands supported by the mock server
"""

import logging

# Configure logging
logging.basicConfig(level=logging.INFO)


def test_outgoing_commands():
    """Test the presence of outgoing command methods"""
    try:
        from server import ChargePoint
    except ImportError as e:
        logging.error(f"Failed to import ChargePoint: {e}")
        return [("import_error", "❌ FAIL: Cannot import server module")]

    expected_methods = [
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
    ]

    results = []

    for method_name in expected_methods:
        command_name = method_name.replace("_send_", "")
        if hasattr(ChargePoint, method_name):
            results.append((command_name, "✅ PASS"))
            logging.info(f"Method {method_name}: PASS")
        else:
            results.append((command_name, "❌ FAIL: Missing method"))
            logging.error(f"Method {method_name}: FAIL - Missing method")

    return results


def check_incoming_handlers():
    """Verify that all incoming handlers are present"""
    try:
        from server import ChargePoint
    except ImportError as e:
        logging.error(f"Failed to import ChargePoint: {e}")
        return [("import_error", "❌ FAIL: Cannot import server module")]

    expected_handlers = [
        "boot_notification",
        "heartbeat",
        "status_notification",
        "authorize",
        "transaction_event",
        "meter_values",
        "notify_report",
        "data_transfer",
        "firmware_status_notification",
        "log_status_notification",
        "security_event_notification",
    ]

    results = []

    for action_name in expected_handlers:
        handler_name = f"on_{action_name}"
        if hasattr(ChargePoint, handler_name):
            results.append((action_name, "✅ PASS"))
            logging.info(f"Handler {handler_name}: PASS")
        else:
            results.append((action_name, "❌ FAIL: Missing handler"))
            logging.error(f"Handler {handler_name}: FAIL - Missing handler")

    return results


def main():
    """Main test function"""
    print("=" * 60)
    print("OCPP 2.0 Mock Server Test")
    print("=" * 60)

    print("\n🔄 Testing outgoing commands...")
    outgoing_results = test_outgoing_commands()

    print("\n🔄 Testing incoming handlers...")
    incoming_results = check_incoming_handlers()

    print("\n📊 Test results:")
    print("\n--- Outgoing commands ---")
    for command, status in outgoing_results:
        print(f"{status} {command}")

    print("\n--- Incoming handlers ---")
    for handler, status in incoming_results:
        print(f"{status} {handler}")

    # Statistics
    outgoing_pass = len([r for r in outgoing_results if "PASS" in r[1]])
    incoming_pass = len([r for r in incoming_results if "PASS" in r[1]])
    total_pass = outgoing_pass + incoming_pass
    total_tests = len(outgoing_results) + len(incoming_results)

    print("\n📈 Statistics:")
    print(f"   Outgoing commands: {outgoing_pass}/{len(outgoing_results)}")
    print(f"   Incoming handlers: {incoming_pass}/{len(incoming_results)}")
    print(
        f"   Total: {total_pass}/{total_tests} ({total_pass / total_tests * 100:.1f}%)"
    )

    if total_pass == total_tests:
        print("\n🎉 All tests passed!")
        return 0
    else:
        print(f"\n⚠️  {total_tests - total_pass} test(s) failed")
        return 1


if __name__ == "__main__":
    exit_code = main()
    exit(exit_code)
