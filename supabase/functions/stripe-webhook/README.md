# stripe-webhook

Idempotent Stripe webhook handler. Verifies signatures, dedupes by `stripe_event_id`, and transitions order state. See [`docs/integrations/STRIPE.md`](../../../docs/integrations/STRIPE.md).

Configured per environment in the Stripe dashboard with the signing secret stored in Supabase project secrets.
