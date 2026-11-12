/**
 * @fileoverview Plan usage maths and wording for the Usage tab: billing
 * period, pace, forecast and what happens past the limit. Facts used:
 * - Paid plans reset at the start of each calendar month (kiro.dev/pricing).
 * - Extra credits cost $0.04 each: add-on credits for individuals,
 *   overages billed at month-end for organizations (kiro.dev/pricing,
 *   kiro.dev/docs/billing/add-on-credits).
 * - Overages are off by default for organizations; an administrator turns
 *   them on in the Kiro console, Settings → Kiro settings
 *   (kiro.dev/docs/enterprise/subscription-management).
 * - Kiro Free can't buy extra credits.
 */

/** Kiro's listed price per extra credit, in US dollars. */
const EXTRA_CREDIT_PRICE = 0.04;
export const PRICE_SOURCE = 'kiro.dev/pricing';
const DAY = 86400000;

/** "2026-11-01" -> local Date, or null. */
export function parseDay(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || '');
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}

/** The billing period: the month that ends at the reset date. */
export function billingPeriod(resetsOn) {
  const end = parseDay(resetsOn);
  if (!end) return null;
  const y = end.getFullYear(), m = end.getMonth() - 1;
  const last = new Date(y, m + 1, 0).getDate();
  return { start: new Date(y, m, Math.min(end.getDate(), last)), end };
}

/**
 * Pace and forecast. Projects the pace so far to the reset date; needs a
 * day of history first, so early in the month it only reports what's used.
 * @returns {null | {daysLeft: number, perDay: number|null, projected: number|null,
 *   runOutOn: Date|null, projectedExtra: number, status: 'ok'|'watch'|'over'|'reached'}}
 */
export function forecast(plan, now = new Date()) {
  const period = billingPeriod(plan?.resetsOn);
  if (!plan || !period) return null;
  const daysLeft = Math.max(0, (period.end - now) / DAY);
  const elapsed = Math.max(0, (now - period.start) / DAY);
  const perDay = elapsed >= 1 ? plan.used / elapsed : null;
  const projected = perDay == null ? null : plan.used + perDay * daysLeft;
  let runOutOn = null;
  let status = 'ok';
  if (plan.hasLimit && plan.limit > 0) {
    if (plan.used >= plan.limit) status = 'reached';
    else if (projected != null && projected > plan.limit) {
      status = 'over';
      runOutOn = new Date(now.getTime() + ((plan.limit - plan.used) / perDay) * DAY);
    } else if (plan.used / plan.limit >= 0.8 || (projected != null && projected / plan.limit >= 0.9)) status = 'watch';
  }
  const projectedExtra = plan.hasLimit && projected != null ? Math.max(0, projected - plan.limit) : 0;
  return { daysLeft, perDay, projected, runOutOn, projectedExtra, status };
}

const dollars = (credits) => `$${(credits * EXTRA_CREDIT_PRICE).toFixed(2)}`;
const n = (x) => Math.round(x).toLocaleString('en-US');
export const shortDate = (d) => (d ? d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '');

/**
 * What happens past the plan limit, as a short title and body.
 * @returns {{tone: 'success'|'info'|'warning'|'error', title: string, body: string, kind: string}}
 */
export function overageAdvice(plan, fc) {
  const reset = shortDate(parseDay(plan.resetsOn)) || 'the reset';
  const limit = n(plan.limit);
  const price = `$${EXTRA_CREDIT_PRICE.toFixed(2)} per credit`;
  const extra = plan.overages?.credits || 0;
  const reached = plan.hasLimit && plan.used >= plan.limit;
  const heading = fc?.status === 'over' && fc.runOutOn ? ` At this pace you'll reach ${limit} credits around ${shortDate(fc.runOutOn)}.` : '';

  if (plan.free) {
    return {
      kind: 'free', tone: reached ? 'error' : fc?.status === 'over' ? 'warning' : 'info',
      title: reached ? 'You\'ve used all your free credits' : 'Kiro Free has no extra credits',
      body: `When you reach ${limit} credits, Kiro pauses until ${reset}.${heading} Paid plans include more credits and let you buy extra credits at ${price}.`,
    };
  }
  if (plan.overages?.enabled) {
    if (extra > 0) {
      return {
        kind: 'overage-used', tone: 'warning', title: `${n(extra)} credits over your plan, about ${dollars(extra)}`,
        body: `Overages are on, so you can keep working. Extra credits cost ${price}${plan.managed ? ', billed to your organization at the end of the month' : ''}.`
          + (fc?.projectedExtra > extra ? ` At this pace that reaches about ${n(fc.projectedExtra)} credits (${dollars(fc.projectedExtra)}) by ${reset}.` : ''),
      };
    }
    return {
      kind: 'overage-on', tone: fc?.status === 'over' ? 'warning' : 'success', title: 'Overages are on',
      body: `If you use more than ${limit} credits before ${reset}, you keep working, and each extra credit costs ${price}${plan.managed ? ', billed to your organization' : ''}.`
        + (fc?.status === 'over' ? ` At this pace that's about ${n(fc.projectedExtra)} extra credits (${dollars(fc.projectedExtra)}).` : ' You haven\'t used any so far.'),
    };
  }
  if (plan.overages && !plan.overages.enabled) {
    return {
      kind: 'overage-off', tone: reached ? 'error' : fc?.status === 'over' ? 'warning' : 'info',
      title: reached ? 'You\'ve reached your plan limit' : 'Overages are off',
      body: `${reached ? `Kiro pauses until ${reset}.` : `When you reach ${limit} credits, Kiro pauses until ${reset}.`}${heading} `
        + (plan.managed
          ? `To keep working past the limit, ask your Kiro administrator to turn on Overages (Kiro console → Settings → Kiro settings). Extra credits are billed at ${price}.`
          : `To keep working past the limit, buy add-on credits at ${price} at app.kiro.dev/account/usage.`),
    };
  }
  if (plan.managed) {
    return {
      kind: 'managed', tone: reached ? 'error' : 'info', title: reached ? 'You\'ve reached your plan limit' : 'Past the limit',
      body: `Your organization manages this plan, and Kiro didn't say whether overages are on.${heading} Ask your Kiro administrator; with overages on, extra credits are billed at ${price}.`,
    };
  }
  return {
    kind: 'addon', tone: reached ? 'error' : fc?.status === 'over' ? 'warning' : 'info',
    title: reached ? 'You\'ve reached your plan limit' : 'Need more than your plan?',
    body: `When your plan credits run out, Kiro uses any add-on credits you have, then pauses until ${reset}.${heading} Add-on credits cost ${price} (packs from $5 for 125 credits) at app.kiro.dev/account/usage and last 12 months.`,
  };
}

/** Credits from this computer's chat files since the period started. */
export function localSince(daily, start) {
  if (!start || !daily) return 0;
  const from = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`;
  return daily.filter((d) => d.date >= from).reduce((a, d) => a + d.credits, 0);
}

/** "KIRO POWER" -> "Kiro Power". */
export const planLabel = (name) => (name || '').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()).replace(/\+$/, '+');
