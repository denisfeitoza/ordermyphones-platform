/**
 * Transactional e-mail templates for the email_outbox rows (EN/PT/ES).
 * Pure functions, no browser APIs: the admin outbox preview uses them now,
 * and the sender (an Edge Function + SMTP provider, to connect) can import
 * the same file to render and send. `site` is the storefront origin.
 */
export type EmailLocale = 'en' | 'pt' | 'es';

export interface RenderedEmail {
  subject: string;
  text: string;
}

type P = Record<string, unknown>;
const s = (v: unknown) => (v === null || v === undefined ? '' : String(v));
const day = (iso: unknown) => (iso ? new Date(String(iso)).toISOString().slice(0, 10) : '');

type T = Record<EmailLocale, (p: P, site: string) => RenderedEmail>;

const sign = { en: '— Order My Phones', pt: '— Order My Phones', es: '— Order My Phones' };

export const EMAIL_TEMPLATES: Record<string, T> = {
  invite: {
    en: (p, site) => ({ subject: 'Your Order My Phones account invitation', text: `You are invited to buy wholesale at Order My Phones (${s(p.tier)} pricing).\n\nCreate your account: ${site}/auth/invite?token=${s(p.token)}\nThe link expires on ${day(p.expires_at)}.\n\n${sign.en}` }),
    pt: (p, site) => ({ subject: 'Seu convite para a Order My Phones', text: `Você foi convidado para comprar no atacado na Order My Phones (preço ${s(p.tier)}).\n\nCrie sua conta: ${site}/auth/invite?token=${s(p.token)}\nO link vence em ${day(p.expires_at)}.\n\n${sign.pt}` }),
    es: (p, site) => ({ subject: 'Tu invitación a Order My Phones', text: `Te invitamos a comprar al por mayor en Order My Phones (precio ${s(p.tier)}).\n\nCrea tu cuenta: ${site}/auth/invite?token=${s(p.token)}\nEl enlace vence el ${day(p.expires_at)}.\n\n${sign.es}` }),
  },
  order_received: {
    en: (p, site) => ({ subject: `Order ${s(p.ref)} received`, text: `We received your order ${s(p.ref)}. Our team checks stock and approves it; you will get the Sales Order with the total and payment details.\n\nTrack it: ${site}/portal/orders/${s(p.order_id)}\n\n${sign.en}` }),
    pt: (p, site) => ({ subject: `Pedido ${s(p.ref)} recebido`, text: `Recebemos seu pedido ${s(p.ref)}. Nossa equipe confere o estoque e aprova; você recebe o Sales Order com o total e os dados de pagamento.\n\nAcompanhe: ${site}/portal/orders/${s(p.order_id)}\n\n${sign.pt}` }),
    es: (p, site) => ({ subject: `Pedido ${s(p.ref)} recibido`, text: `Recibimos tu pedido ${s(p.ref)}. Nuestro equipo revisa el stock y lo aprueba; recibirás el Sales Order con el total y los datos de pago.\n\nSíguelo: ${site}/portal/orders/${s(p.order_id)}\n\n${sign.es}` }),
  },
  order_approved: {
    en: (p, site) => ({ subject: `Order ${s(p.ref)} approved — Sales Order ready`, text: `Your order ${s(p.ref)} is approved. Download the Sales Order (total, due date ${day(p.due_at) || 'on delivery'}, bank details): ${site}/portal/orders/${s(p.order_id)}\n\n${sign.en}` }),
    pt: (p, site) => ({ subject: `Pedido ${s(p.ref)} aprovado — Sales Order pronto`, text: `Seu pedido ${s(p.ref)} foi aprovado. Baixe o Sales Order (total, vencimento ${day(p.due_at) || 'na entrega'}, dados bancários): ${site}/portal/orders/${s(p.order_id)}\n\n${sign.pt}` }),
    es: (p, site) => ({ subject: `Pedido ${s(p.ref)} aprobado — Sales Order listo`, text: `Tu pedido ${s(p.ref)} fue aprobado. Descarga el Sales Order (total, vencimiento ${day(p.due_at) || 'a la entrega'}, datos bancarios): ${site}/portal/orders/${s(p.order_id)}\n\n${sign.es}` }),
  },
  order_rejected: {
    en: (p) => ({ subject: `Order ${s(p.ref)} not approved`, text: `We could not approve order ${s(p.ref)}.${p.reason ? `\nReason: ${s(p.reason)}` : ''}\n\n${sign.en}` }),
    pt: (p) => ({ subject: `Pedido ${s(p.ref)} não aprovado`, text: `Não conseguimos aprovar o pedido ${s(p.ref)}.${p.reason ? `\nMotivo: ${s(p.reason)}` : ''}\n\n${sign.pt}` }),
    es: (p) => ({ subject: `Pedido ${s(p.ref)} no aprobado`, text: `No pudimos aprobar el pedido ${s(p.ref)}.${p.reason ? `\nMotivo: ${s(p.reason)}` : ''}\n\n${sign.es}` }),
  },
  order_cancelled: {
    en: (p) => ({ subject: `Order ${s(p.ref)} cancelled`, text: `Order ${s(p.ref)} was cancelled.${p.reason ? `\nReason: ${s(p.reason)}` : ''}\n\n${sign.en}` }),
    pt: (p) => ({ subject: `Pedido ${s(p.ref)} cancelado`, text: `O pedido ${s(p.ref)} foi cancelado.${p.reason ? `\nMotivo: ${s(p.reason)}` : ''}\n\n${sign.pt}` }),
    es: (p) => ({ subject: `Pedido ${s(p.ref)} cancelado`, text: `El pedido ${s(p.ref)} fue cancelado.${p.reason ? `\nMotivo: ${s(p.reason)}` : ''}\n\n${sign.es}` }),
  },
  order_shipped: {
    en: (p, site) => ({ subject: `Order ${s(p.ref)} shipped`, text: `Order ${s(p.ref)} is on its way${p.tracking ? ` (${s(p.carrier)} ${s(p.tracking)})` : ''}.\n\n${site}/portal/orders/${s(p.order_id)}\n\n${sign.en}` }),
    pt: (p, site) => ({ subject: `Pedido ${s(p.ref)} enviado`, text: `O pedido ${s(p.ref)} saiu${p.tracking ? ` (${s(p.carrier)} ${s(p.tracking)})` : ''}.\n\n${site}/portal/orders/${s(p.order_id)}\n\n${sign.pt}` }),
    es: (p, site) => ({ subject: `Pedido ${s(p.ref)} enviado`, text: `El pedido ${s(p.ref)} va en camino${p.tracking ? ` (${s(p.carrier)} ${s(p.tracking)})` : ''}.\n\n${site}/portal/orders/${s(p.order_id)}\n\n${sign.es}` }),
  },
  payment_received: {
    en: (p) => ({ subject: `Payment received — ${s(p.ref)}`, text: `We received your payment for ${s(p.ref)}. Thank you.\n\n${sign.en}` }),
    pt: (p) => ({ subject: `Pagamento recebido — ${s(p.ref)}`, text: `Recebemos o pagamento do ${s(p.ref)}. Obrigado.\n\n${sign.pt}` }),
    es: (p) => ({ subject: `Pago recibido — ${s(p.ref)}`, text: `Recibimos el pago de ${s(p.ref)}. Gracias.\n\n${sign.es}` }),
  },
  label_requested: {
    en: (p, site) => ({ subject: `Packed — send your label for ${s(p.ref)}`, text: `Order ${s(p.ref)} is packed. Buy your label for the box below and upload it: ${site}/portal/orders/${s(p.order_id)}\n\nBox: ${JSON.stringify(p.package ?? {})}\n\n${sign.en}` }),
    pt: (p, site) => ({ subject: `Embalado — envie a etiqueta do ${s(p.ref)}`, text: `O pedido ${s(p.ref)} está embalado. Compre a etiqueta para a caixa abaixo e envie: ${site}/portal/orders/${s(p.order_id)}\n\nCaixa: ${JSON.stringify(p.package ?? {})}\n\n${sign.pt}` }),
    es: (p, site) => ({ subject: `Empacado — envía la etiqueta de ${s(p.ref)}`, text: `El pedido ${s(p.ref)} está empacado. Compra la etiqueta para la caja y súbela: ${site}/portal/orders/${s(p.order_id)}\n\nCaja: ${JSON.stringify(p.package ?? {})}\n\n${sign.es}` }),
  },
  registration_approved: {
    en: () => ({ subject: 'Your company registration is approved', text: `Your company registration is approved. You are ready to order.\n\n${sign.en}` }),
    pt: () => ({ subject: 'Seu cadastro foi aprovado', text: `O cadastro da sua empresa foi aprovado. Você já pode comprar.\n\n${sign.pt}` }),
    es: () => ({ subject: 'Tu registro fue aprobado', text: `El registro de tu empresa fue aprobado. Ya puedes comprar.\n\n${sign.es}` }),
  },
  registration_changes_requested: {
    en: (p, site) => ({ subject: 'Please update your company registration', text: `Our team asked for changes: ${s(p.note)}\n\n${site}/portal/business\n\n${sign.en}` }),
    pt: (p, site) => ({ subject: 'Ajuste o cadastro da sua empresa', text: `Nossa equipe pediu ajustes: ${s(p.note)}\n\n${site}/portal/business\n\n${sign.pt}` }),
    es: (p, site) => ({ subject: 'Actualiza el registro de tu empresa', text: `Nuestro equipo pidió cambios: ${s(p.note)}\n\n${site}/portal/business\n\n${sign.es}` }),
  },
};

// Staff alerts are English only.
const staff = (subject: (p: P) => string, text: (p: P, site: string) => string): T => {
  const f = (p: P, site: string) => ({ subject: subject(p), text: text(p, site) });
  return { en: f, pt: f, es: f };
};
EMAIL_TEMPLATES.order_placed_staff = staff((p) => `New order ${s(p.ref)}${p.is_test ? ' (TEST)' : ''}`, (p, site) => `New order ${s(p.ref)} from ${s(p.customer_email)}.\n${site}/admin/orders`);
EMAIL_TEMPLATES.label_received_staff = staff((p) => `Label received — ${s(p.ref)}`, (p, site) => `The buyer uploaded the shipping label for ${s(p.ref)}. Ready to ship.\n${site}/admin/orders`);
EMAIL_TEMPLATES.access_request_staff = staff((p) => `Access request — ${s(p.business)}`, (p, site) => `${s(p.name)} (${s(p.email)}) from ${s(p.business)} asked for an account (${s(p.tier_interest)}).\n${site}/admin/customers`);
EMAIL_TEMPLATES.registration_submitted_staff = staff((p) => `Registration to review — ${s(p.legal_name) || s(p.email)}`, (p, site) => `${s(p.legal_name) || s(p.email)} submitted the company registration.\n${site}/admin/customers/account/${s(p.account_id)}`);

export function renderEmail(template: string, locale: string, payload: P, site: string): RenderedEmail | null {
  const t = EMAIL_TEMPLATES[template];
  if (!t) return null;
  const loc: EmailLocale = locale === 'pt' || locale === 'es' ? locale : 'en';
  return t[loc](payload, site);
}

