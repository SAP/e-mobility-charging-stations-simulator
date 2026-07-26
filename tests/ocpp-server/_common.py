"""OCPP-version-agnostic helpers shared by the 1.6 and 2.0.1 mock servers."""

import argparse
import math
from enum import StrEnum
from typing import TypeVar

ActionT = TypeVar("ActionT", bound=StrEnum)


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
