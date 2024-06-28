"""Timer for asyncio."""

import asyncio


class Timer:
    def __init__(
        self,
        timeout: float,
        repeat: bool,
        callback,
        callback_args=(),
        callback_kwargs=None,
    ):
        """
        An asynchronous Timer object.

        Parameters
        ----------
        timeout: :class:`float`:
        The duration for which the timer should last.

        repeat: :class:`bool`:
        Whether the timer should repeat.

        callback: :class:`Coroutine` or `Method` or `Function`:
        An `asyncio` coroutine or a regular method that will be called as soon as
        the timer ends.

        callback_args: Optional[:class:`tuple`]:
        The args to be passed to the callback.

        callback_kwargs: Optional[:class:`dict`]:
        The kwargs to be passed to the callback.
        """
        self._timeout = timeout
        self._repeat = repeat
        self._callback = callback
        self._task = asyncio.create_task(self._job())
        self._callback_args = callback_args
        if callback_kwargs is None:
            callback_kwargs = {}
        self._callback_kwargs = callback_kwargs

    async def _job(self):
        if self._repeat:
            while self._task.cancelled() is False:
                await asyncio.sleep(self._timeout)
                await self._call_callback()
        else:
            await asyncio.sleep(self._timeout)
            await self._call_callback()

    async def _call_callback(self):
        if asyncio.iscoroutine(self._callback) or asyncio.iscoroutinefunction(
            self._callback
        ):
            await self._callback(*self._callback_args, **self._callback_kwargs)
        else:
            self._callback(*self._callback_args, **self._callback_kwargs)

    def cancel(self):
        """Cancels the timer. The callback will not be called."""
        self._task.cancel()
