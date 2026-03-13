"""Tests for the asynchronous Timer utility."""

import asyncio

from timer import Timer


class TestOneShotTimer:
    """Tests for one-shot (non-repeating) timer behavior."""

    async def test_fires_once_after_timeout(self):
        """Timer fires exactly once after the specified timeout."""
        fired = asyncio.Event()
        Timer(0.01, False, fired.set)
        await asyncio.wait_for(fired.wait(), timeout=2.0)
        assert fired.is_set()

    async def test_callback_receives_args_kwargs(self):
        """Callback receives positional and keyword arguments."""
        result: dict = {}
        event = asyncio.Event()

        def cb(a, b, key=None):
            result["a"] = a
            result["b"] = b
            result["key"] = key
            event.set()

        Timer(0.01, False, cb, callback_args=(1, 2), callback_kwargs={"key": "val"})
        await asyncio.wait_for(event.wait(), timeout=2.0)
        assert result == {"a": 1, "b": 2, "key": "val"}

    async def test_task_completes_after_firing(self):
        """Timer's internal task completes after one-shot fires."""
        event = asyncio.Event()
        timer = Timer(0.01, False, event.set)
        await asyncio.wait_for(event.wait(), timeout=2.0)
        await asyncio.sleep(0.02)
        assert timer._task.done()


class TestRepeatingTimer:
    """Tests for repeating timer behavior."""

    async def test_fires_repeatedly_at_interval(self):
        """Timer fires at least 3 times before being cancelled."""
        count = 0
        at_least_three = asyncio.Event()

        def cb():
            nonlocal count
            count += 1
            if count >= 3:
                at_least_three.set()

        timer = Timer(0.01, True, cb)
        await asyncio.wait_for(at_least_three.wait(), timeout=2.0)
        timer.cancel()
        assert count >= 3

    async def test_respects_interval_between_fires(self):
        """Interval between fires is approximately correct."""
        timestamps: list[float] = []
        enough = asyncio.Event()

        def cb():
            timestamps.append(asyncio.get_event_loop().time())
            if len(timestamps) >= 4:
                enough.set()

        timer = Timer(0.03, True, cb)
        await asyncio.wait_for(enough.wait(), timeout=2.0)
        timer.cancel()

        for i in range(1, len(timestamps)):
            delta = timestamps[i] - timestamps[i - 1]
            assert delta >= 0.02, f"Interval {delta:.4f}s too short"
            assert delta < 0.15, f"Interval {delta:.4f}s too long"


class TestTimerCancellation:
    """Tests for timer cancellation behavior."""

    async def test_cancel_before_first_fire_prevents_callback(self):
        """Cancelling before timeout prevents callback from being called."""
        called = False

        def cb():
            nonlocal called
            called = True

        timer = Timer(0.05, False, cb)
        timer.cancel()
        await asyncio.sleep(0.08)
        assert not called

    async def test_cancel_during_repeating_stops_future_fires(self):
        """Cancelling a repeating timer stops future invocations."""
        count = 0

        def cb():
            nonlocal count
            count += 1

        timer = Timer(0.01, True, cb)
        await asyncio.sleep(0.05)
        timer.cancel()
        count_at_cancel = count
        await asyncio.sleep(0.05)
        assert count == count_at_cancel

    async def test_cancel_is_idempotent(self):
        """Calling cancel twice does not raise an exception."""
        timer = Timer(0.05, False, lambda: None)
        timer.cancel()
        timer.cancel()


class TestCallbackTypes:
    """Tests for different callback types (sync, async, awaitable)."""

    async def test_async_callback_works(self):
        """Coroutine function callback is properly awaited."""
        event = asyncio.Event()

        async def async_cb():
            event.set()

        Timer(0.01, False, async_cb)
        await asyncio.wait_for(event.wait(), timeout=2.0)
        assert event.is_set()

    async def test_sync_callback_works(self):
        """Plain synchronous function callback works."""
        event = asyncio.Event()

        def sync_cb():
            event.set()

        Timer(0.01, False, sync_cb)
        await asyncio.wait_for(event.wait(), timeout=2.0)
        assert event.is_set()

    async def test_sync_returning_awaitable_works(self):
        """Sync function returning an awaitable (covers isawaitable path)."""
        event = asyncio.Event()

        async def _real_work():
            event.set()

        def sync_returning_coro():
            return _real_work()

        Timer(0.01, False, sync_returning_coro)
        await asyncio.wait_for(event.wait(), timeout=2.0)
        assert event.is_set()


class TestTimerEdgeCases:
    """Tests for edge cases and boundary conditions."""

    async def test_timeout_zero_fires_immediately(self):
        """Timer with timeout=0 fires nearly immediately."""
        event = asyncio.Event()
        Timer(0, False, event.set)
        await asyncio.wait_for(event.wait(), timeout=2.0)
        assert event.is_set()

    async def test_cancel_during_callback_execution(self):
        """Cancel called from within callback does not raise."""
        event = asyncio.Event()
        timer_ref: list[Timer] = []

        def cb():
            timer_ref[0].cancel()
            event.set()

        timer = Timer(0.01, True, cb)
        timer_ref.append(timer)
        await asyncio.wait_for(event.wait(), timeout=2.0)
        await asyncio.sleep(0.03)
        assert event.is_set()
