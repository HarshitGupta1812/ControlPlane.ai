import logging
import sys

import structlog


def configure_logging(level: str = "INFO", development: bool = False) -> None:
    logging.basicConfig(stream=sys.stdout, level=getattr(logging, level.upper(), logging.INFO), format="%(message)s")
    renderer = structlog.dev.ConsoleRenderer(colors=True) if development else structlog.processors.JSONRenderer()
    structlog.configure(processors=[structlog.contextvars.merge_contextvars, structlog.processors.TimeStamper(fmt="iso"), renderer])


def get_logger(name: str = "controlplane"):
    return structlog.get_logger(name)
