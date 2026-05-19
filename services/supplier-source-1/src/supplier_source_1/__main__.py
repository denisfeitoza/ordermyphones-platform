"""CLI entrypoint for the supplier-source-1 adapter."""

from __future__ import annotations

import typer

from .sync import run_catalog, run_dispatch, run_inventory

cli = typer.Typer(help="OrderMyPhones — supplier-source-1 (US dropship #1)")


@cli.command()
def sync(
    kind: str = typer.Argument("inventory", help="catalog | inventory | both"),
    dry_run: bool = typer.Option(False, "--dry-run", help="Do not write to Supabase."),
    loop: bool = typer.Option(False, "--loop", help="Loop forever with env-configured cadence."),
) -> None:
    """Run one of the sync jobs once, or loop in development mode."""
    if kind == "catalog":
        run_catalog(dry_run=dry_run, loop=loop)
    elif kind == "inventory":
        run_inventory(dry_run=dry_run, loop=loop)
    elif kind == "both":
        run_catalog(dry_run=dry_run, loop=False)
        run_inventory(dry_run=dry_run, loop=loop)
    else:
        raise typer.BadParameter(f"unknown kind: {kind}")


@cli.command()
def dispatch(order_id: str) -> None:
    """Dispatch a paid order to the supplier."""
    run_dispatch(order_id=order_id)


if __name__ == "__main__":
    cli()
