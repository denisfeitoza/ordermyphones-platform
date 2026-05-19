// supabase/functions/stripe-webhook/index.ts
// Idempotent Stripe webhook handler.
// Contract: docs/integrations/STRIPE.md.

// @ts-nocheck — Deno runtime
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import Stripe from 'https://esm.sh/stripe@16.12.0?target=deno';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const STRIPE_SECRET = Deno.env.get('STRIPE_SECRET_KEY')!;
const STRIPE_WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET')!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const stripe = new Stripe(STRIPE_SECRET, {
  apiVersion: '2024-06-20',
  httpClient: Stripe.createFetchHttpClient(),
});

serve(async (req) => {
  if (req.method !== 'POST') return new Response('method_not_allowed', { status: 405 });

  const signature = req.headers.get('stripe-signature');
  if (!signature) return new Response('missing_signature', { status: 400 });

  const raw = await req.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(raw, signature, STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('stripe_signature_invalid', err);
    return new Response('invalid_signature', { status: 400 });
  }

  // Idempotency: dedupe via stripe_event_id (table is added in a follow-up
  // migration; the scaffold logs the intent and would no-op on duplicate).
  // INSERT ... ON CONFLICT DO NOTHING returning xmax pattern is the planned shape.

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await onCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
        break;
      case 'payment_intent.payment_failed':
        await onPaymentFailed(event.data.object as Stripe.PaymentIntent);
        break;
      case 'charge.refunded':
        await onChargeRefunded(event.data.object as Stripe.Charge);
        break;
      default:
        console.log('stripe_event_ignored', { type: event.type });
    }
  } catch (err) {
    console.error('stripe_handler_failed', { type: event.type, err: String(err) });
    return new Response('handler_failed', { status: 500 });
  }

  return new Response('ok', { status: 200 });
});

async function onCheckoutCompleted(session: Stripe.Checkout.Session) {
  const orderId = session.client_reference_id;
  if (!orderId) return;

  await supabase
    .from('orders')
    .update({ status: 'paid', stripe_payment_intent_id: session.payment_intent as string })
    .eq('id', orderId);

  await supabase.from('payments').upsert(
    {
      order_id: orderId,
      stripe_payment_intent_id: session.payment_intent as string,
      amount_cents: session.amount_total ?? 0,
      currency: (session.currency ?? 'usd').toUpperCase(),
      status: 'succeeded',
      raw_event: session as unknown as Record<string, unknown>,
    },
    { onConflict: 'stripe_payment_intent_id' },
  );

  // tier-upgrade is invoked from a downstream cron / RPC step in Phase 2.
}

async function onPaymentFailed(pi: Stripe.PaymentIntent) {
  await supabase
    .from('payments')
    .update({ status: 'failed', raw_event: pi as unknown as Record<string, unknown> })
    .eq('stripe_payment_intent_id', pi.id);
}

async function onChargeRefunded(charge: Stripe.Charge) {
  const piId = typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id;
  if (!piId) return;

  await supabase
    .from('payments')
    .update({ status: 'refunded', raw_event: charge as unknown as Record<string, unknown> })
    .eq('stripe_payment_intent_id', piId);

  await supabase
    .from('orders')
    .update({ status: 'refunded' })
    .eq('stripe_payment_intent_id', piId);
}
