"""Asynchronous timer with support for one-shot and repeating callbacks."""

import asyncio
import inspect
from collections.abc import Callable
from typing import Any


class Timer:
    """Asynchronous timer with one-shot and repeating callback support."""

    def __init__(
        self,
        timeout: float,
        repeat: bool,
        callback: Callable[..., Any],
        callback_args: tuple = (),
        callback_kwargs: dict[str, Any] | None = None,
    ):
        """Create an asynchronous timer.

        Parameters
        ----------
        timeout:
            Duration in seconds before the callback is invoked.
        repeat:
            Whether the timer should repeat after each invocation.
        callback:
            A sync or async callable to invoke when the timer fires.
        callback_args:
            Positional arguments passed to the callback.
        callback_kwargs:
            Keyword arguments passed to the callback.

        """
        self._timeout = timeout
        self._repeat = repeat
        self._callback = callback
        self._callback_args = callback_args
        self._callback_kwargs = callback_kwargs or {}
        self._task = asyncio.create_task(self._job())

    async def _job(self) -> None:
        if self._repeat:
            while not self._task.cancelled():
                await asyncio.sleep(self._timeout)
                await self._call_callback()
        else:
            await asyncio.sleep(self._timeout)
            await self._call_callback()

    async def _call_callback(self) -> None:
        if inspect.iscoroutinefunction(self._callback):
            await self._callback(*self._callback_args, **self._callback_kwargs)
        else:
            result = self._callback(*self._callback_args, **self._callback_kwargs)
            if inspect.isawaitable(result):
                await result

    def cancel(self) -> None:
        """Cancel the timer. The callback will not be called."""
        self._task.cancel()
