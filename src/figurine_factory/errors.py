"""Typed failures. Every one carries a message a human can act on."""
from __future__ import annotations


class FigurineError(Exception):
    exit_code = 1


class IntakeError(FigurineError):
    exit_code = 5


class GenerationError(FigurineError):
    exit_code = 3


class RepairError(FigurineError):
    exit_code = 6


class SliceError(FigurineError):
    exit_code = 4


class ValidationFailure(FigurineError):
    """Raised when one or more gates fail. Never emit a mesh after this."""

    exit_code = 2

    def __init__(self, failures: list["GateResult"]):  # noqa: F821
        self.failures = failures
        super().__init__(self.render())

    def render(self) -> str:
        lines = [f"{len(self.failures)} validation gate(s) failed:"]
        for f in self.failures:
            lines.append(f"  FAIL {f.gate}: measured {f.measured}, needs {f.requirement}")
            if f.hint:
                lines.append(f"       fix: {f.hint}")
        lines.append("No mesh was written. A bad STL is worse than no STL.")
        return "\n".join(lines)
