// Money is always integer minor units (paise for INR). Never floats.
// Percentages are basis points: 33.33% = 3333.

export const MAX_CENTS = 1_000_000_000 // ₹1 crore

const formatters = new Map()

function formatter(currency, fraction) {
  const key = `${currency}:${fraction}`
  if (!formatters.has(key)) {
    formatters.set(
      key,
      new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : 'en-US', {
        style: 'currency',
        currency,
        minimumFractionDigits: fraction,
        maximumFractionDigits: fraction,
      }),
    )
  }
  return formatters.get(key)
}

/**
 * formatMoney(300000) → "₹3,000"; formatMoney(290775) → "₹2,907.75".
 * Whole amounts drop the decimals. Pass { fraction: 2 } to force them,
 * or { abs: true } to drop the sign.
 */
export function formatMoney(cents, currency = 'INR', { abs = false, fraction } = {}) {
  let value = Math.round(Number(cents) || 0)
  if (abs) value = Math.abs(value)
  const digits = fraction ?? (value % 100 === 0 ? 0 : 2)
  return formatter(currency, digits).format(value / 100)
}

/** "₹" for INR, "$" for USD … */
export function currencySymbol(currency = 'INR') {
  const part = formatter(currency, 0)
    .formatToParts(0)
    .find((p) => p.type === 'currency')
  return part?.value ?? currency
}

/** Cents → plain input text: 300000 → "3000", 290775 → "2907.75". */
export function centsToInput(cents) {
  if (cents === null || cents === undefined || Number.isNaN(cents)) return ''
  const whole = Math.trunc(cents / 100)
  const frac = Math.abs(cents % 100)
  return frac === 0 ? String(whole) : `${whole}.${String(frac).padStart(2, '0')}`
}

// Parses "1,234.5" style text with up to two decimals, using string maths only.
function parseFixed2(input) {
  if (input === null || input === undefined) return null
  const s = String(input).replace(/[\s,₹$€£%]/g, '')
  if (!/^(\d+(\.\d{0,2})?|\.\d{1,2})$/.test(s)) return null
  const [whole, frac = ''] = s.split('.')
  return Number(whole || '0') * 100 + Number(`${frac}00`.slice(0, 2))
}

/** "3,000.50" → 300050 paise. Returns null for anything that isn't an amount. */
export function parseAmount(input) {
  return parseFixed2(input)
}

/** "33.33" → 3333 basis points. Returns null for invalid text. */
export function parsePercent(input) {
  return parseFixed2(input)
}

/** 3333 → "33.33", 5000 → "50". */
export function formatPercent(bp) {
  return centsToInput(bp)
}

/**
 * Largest remainder method, matching the server:
 * everyone gets floor(total * w / sum); leftover units go to the largest
 * remainders, ties to the lowest user id.
 * items: [{ userId, weight }] → { [userId]: units }
 */
export function largestRemainder(total, items) {
  const out = {}
  const sum = items.reduce((acc, i) => acc + i.weight, 0)
  if (sum <= 0 || total <= 0) {
    for (const i of items) out[i.userId] = 0
    return out
  }
  let given = 0
  const rows = items.map((i) => {
    const num = total * i.weight
    const share = Math.floor(num / sum)
    given += share
    return { userId: i.userId, share, rem: num % sum }
  })
  let left = total - given
  rows.sort((a, b) => b.rem - a.rem || a.userId - b.userId)
  for (const r of rows) {
    out[r.userId] = r.share + (left > 0 ? 1 : 0)
    if (left > 0) left -= 1
  }
  return out
}

/** Percentages that add up to exactly 100%: 3 people → 3334, 3333, 3333. */
export function defaultPercents(userIds) {
  return largestRemainder(
    10000,
    userIds.map((userId) => ({ userId, weight: 1 })),
  )
}

/**
 * Live split preview. The server always has the final say.
 * splits: [{ userId, value }] for the selected participants only;
 * value is cents (exact), basis points (percent) or a count (shares).
 * Returns { shares: { [userId]: cents }, error: string | null }.
 */
export function previewSplit(amountCents, splitType, splits, { currency = 'INR' } = {}) {
  const total = Math.max(0, Math.round(Number(amountCents) || 0))
  const money = (c) => formatMoney(c, currency)

  if (splits.length === 0) {
    return { shares: {}, error: 'Choose at least one person to split with.' }
  }

  if (splitType === 'equal') {
    return {
      shares: largestRemainder(total, splits.map((s) => ({ userId: s.userId, weight: 1 }))),
      error: null,
    }
  }

  if (splitType === 'exact') {
    const shares = {}
    let sum = 0
    for (const s of splits) {
      const v = Math.max(0, Math.round(Number(s.value) || 0))
      shares[s.userId] = v
      sum += v
    }
    let error = null
    if (total > 0 && sum < total) {
      error = `The amounts add up to ${money(sum)}. Assign the other ${money(total - sum)}.`
    } else if (total > 0 && sum > total) {
      error = `The amounts add up to ${money(sum)}, which is ${money(sum - total)} more than the total.`
    }
    return { shares, error }
  }

  if (splitType === 'percent') {
    const sum = splits.reduce((acc, s) => acc + Math.max(0, Number(s.value) || 0), 0)
    if (sum !== 10000) {
      const shares = {}
      for (const s of splits) shares[s.userId] = Math.floor((total * Math.max(0, Number(s.value) || 0)) / 10000)
      return {
        shares,
        error: `The percentages add up to ${formatPercent(sum)}%. Make them add up to 100%.`,
      }
    }
    return {
      shares: largestRemainder(total, splits.map((s) => ({ userId: s.userId, weight: Number(s.value) }))),
      error: null,
    }
  }

  if (splitType === 'shares') {
    const bad = splits.some((s) => !Number.isInteger(Number(s.value)) || Number(s.value) < 1)
    if (bad) {
      const shares = {}
      for (const s of splits) shares[s.userId] = 0
      return { shares, error: 'Give everyone at least 1 share.' }
    }
    return {
      shares: largestRemainder(total, splits.map((s) => ({ userId: s.userId, weight: Number(s.value) }))),
      error: null,
    }
  }

  return { shares: {}, error: 'Choose how to split it.' }
}
