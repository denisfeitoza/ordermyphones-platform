"""CLI entrypoint for the supplier-source-2 adapter."""

from __future__ import annotations

import typer

from .sync import run_catalog, run_dispatch, run_inventory

cli = typer.Typer(help="OrderMyPhones — supplier-source-2 (US #2 + Dubai wholesale)")


@cli.command()
def sync(
    kind: str = typer.Argument("inventory", help="catalog | inventory | both"),
    feed: str = typer.Option("all", "--feed", help="us | dxb | all"),
    dry_run: bool = typer.Option(False, "--dry-run"),
    loop: bool = typer.Option(False, "--loop"),
) -> None:
    if kind == "catalog":
        run_catalog(feed=feed, dry_run=dry_run, loop=loop)
    elif kind == "inventory":
        run_inventory(feed=feed, dry_run=dry_run, loop=loop)
    elif kind == "both":
        run_catalog(feed=feed, dry_run=dry_run, loop=False)
        run_inventory(feed=feed, dry_run=dry_run, loop=loop)
    else:
        raise typer.BadParameter(f"unknown kind: {kind}")


@cli.command()
def dispatch(order_item_id: str) -> None:
    run_dispatch(order_item_id=order_item_id)


if __name__ == "__main__":
    cli()
