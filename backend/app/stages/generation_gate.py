from collections import deque


class StreamingSafetyGate:
    """Buffer a small output window before release; unsafe windows are cancelled atomically."""

    def __init__(self, buffer_chars: int = 120) -> None:
        self.buffer_chars = max(20, buffer_chars)
        self.buffer: deque[str] = deque()
        self.cancelled = False

    @property
    def max_chars(self) -> int:
        return self.buffer_chars

    def peek(self) -> str:
        return "".join(self.buffer)

    def push(self, token: str, unsafe: bool = False) -> list[str]:
        if self.cancelled:
            return []
        if unsafe:
            self.cancelled = True
            self.buffer.clear()
            return []
        self.buffer.append(token)
        if len(self.peek()) >= self.buffer_chars:
            released = list(self.buffer)
            self.buffer.clear()
            return released
        return []

    def cancel(self) -> None:
        self.cancelled = True
        self.buffer.clear()

    def flush(self) -> list[str]:
        if self.cancelled:
            return []
        released = list(self.buffer)
        self.buffer.clear()
        return released
