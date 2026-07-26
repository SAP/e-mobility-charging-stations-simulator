"""OCPP-version-agnostic helpers shared by the 1.6 and 2.0.1 mock servers."""

import argparse
import math


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
