"""Tests for what happens when the writer saves again mid-build.

No model and no server: `Builds` is handed whatever answers `infer`, so a stub
that records what it was asked exercises the whole supersession path.
"""

import unittest
from pathlib import Path
from typing import Any
