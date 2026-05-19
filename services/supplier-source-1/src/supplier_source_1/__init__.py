"""Adapter for OrderMyPhones Supplier API #1 (U.S. dropship).

Public surface:

- `adapter.SupplierSource1` — unified API used by sync jobs.
- `sync.run_catalog`, `sync.run_inventory`, `sync.run_dispatch`, `sync.run_tracking`.
- `models.*` — Pydantic data shapes shared between REST and Scrapling paths.
"""

__version__ = "0.1.0"
__all__ = ["__version__"]
