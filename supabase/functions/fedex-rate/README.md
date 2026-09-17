# fedex-rate

Shipping **estimate** for a destination + unit count, quoted from every active
warehouse that has a postal code (`stock_locations.postal_code`). Returns the
options sorted cheapest-first, with the origin that produced each one.

This never touches money: order totals stay tier price × qty computed by
`place_order` (D4/D8). The number is shown at checkout under "Shipping" and to
staff — shipping is still invoiced separately.

Input (requires the caller's user JWT — each quote is a billed FedEx transaction):

```json
{
  "destination": { "postal_code": "75201", "state_code": "TX", "city": "Dallas", "residential": true },
  "units": 40,
  "location_id": "uuid (optional — quote one warehouse instead of all)"
}
```

Parcels come from the `shipping_package_defaults` row in `app_settings`
(`unit_weight_lb`, `box_weight_lb`, `units_per_box`, `box_inches`), so a
40-unit quote is 2 parcels rather than one impossible package.

Errors worth handling: `503 fedex_not_configured` (no keys yet),
`409 no_origin_configured` (no warehouse has a postal code), `502 no_rates`
(FedEx refused every origin — `errors[]` carries why).

Env: `FEDEX_CLIENT_ID`, `FEDEX_CLIENT_SECRET`, `FEDEX_ACCOUNT_NUMBER`,
`FEDEX_API_BASE` (defaults to the sandbox host).
