"""
logger.py
----------
Centralised structured logging for tradingGo backend.
Uses Python stdlib `logging` — no extra dependencies required.

Usage:
    from app.logger import get_logger
    logger = get_logger(__name__)
    logger.info("Something happened", extra={"ticker": "AAPL"})
"""

import logging
import sys


def get_logger(name: str) -> logging.Logger:
    """
    Return a named logger with a consistent format.
    Safe to call multiple times — Python's logging module deduplicates handlers.
    """
    logger = logging.getLogger(name)

    if not logger.handlers:
        handler = logging.StreamHandler(sys.stdout)
        handler.setFormatter(
            logging.Formatter(
                fmt="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
                datefmt="%Y-%m-%dT%H:%M:%S",
            )
        )
        logger.addHandler(handler)

    logger.setLevel(logging.INFO)
    logger.propagate = False
    return logger
