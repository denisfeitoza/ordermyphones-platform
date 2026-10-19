/**
 * Modules built ahead of a signed Change Order (Agreement §8) stay switched
 * off: no routes, no menu entries. The database refuses them too
 * (20261019117000_auctions_off.sql). Turn on only with a signed Change Order.
 */
export const AUCTIONS_ENABLED = false;
