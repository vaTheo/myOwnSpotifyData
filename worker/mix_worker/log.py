"""One line per step, to the terminal and to the log file (FR-017)."""

from __future__ import annotations

import sys
import time
import traceback
from pathlib import Path
from typing import TextIO


class Log:
    def __init__(self, path: Path | None, out: TextIO = sys.stdout) -> None:
        self.path = path
        self.out = out

    def _write(self, text: str, to_terminal: bool = True) -> None:
        stamp = time.strftime("%Y-%m-%d %H:%M:%S")
        if to_terminal:
            print(text, file=self.out, flush=True)
        if self.path is not None:
            try:
                self.path.parent.mkdir(parents=True, exist_ok=True)
                with self.path.open("a", encoding="utf-8") as f:
                    f.write(f"{stamp} {text}\n")
            except OSError:
                pass

    def line(self, text: str) -> None:
        self._write(text)

    def step(self, name: str, outcome: str, seconds: float) -> None:
        self._write(f"  {name} · {outcome} · {seconds:.1f} s")

    def exception(self, err: BaseException) -> None:
        """The traceback goes to the file only; the terminal gets one line."""
        self._write(f"  error · {type(err).__name__}: {err}")
        self._write("".join(traceback.format_exception(err)), to_terminal=False)
