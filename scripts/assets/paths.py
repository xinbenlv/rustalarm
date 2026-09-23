"""Shared, project-relative paths for the offline original asset converters."""
import os
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]


def configured_path(variable, default):
    value = Path(os.environ.get(variable, str(default))).expanduser()
    return value.resolve() if value.is_absolute() else (PROJECT_ROOT / value).resolve()


ASSET_CACHE = configured_path('RA2_ASSET_CACHE', PROJECT_ROOT / '_3p')
PUBLIC_DIR = configured_path('RA2_PUBLIC_DIR', PROJECT_ROOT / 'public')
