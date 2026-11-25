// Dates, categories, currencies and small text helpers.

export const CATEGORIES = [
  { value: 'food', label: 'Food' },
  { value: 'transport', label: 'Transport' },
  { value: 'stay', label: 'Stay' },
  { value: 'groceries', label: 'Groceries' },
  { value: 'utilities', label: 'Utilities' },
  { value: 'entertainment', label: 'Entertainment' },
  { value: 'shopping', label: 'Shopping' },
  { value: 'other', label: 'Other' },
]

export const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'AED', 'SGD']

export function categoryLabel(value) {
  return CATEGORIES.find((c) => c.value === value)?.label ?? null
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
const MONTHS_SHORT = MONTHS.map((m) => m.slice(0, 3))

const pad = (n) => String(n).padStart(2, '0')

// "YYYY-MM-DD" is a calendar date: parse it as a local date, never as UTC.
function parseDate(value) {
  if (value instanceof Date) return value
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split('-').map(Number)
    return new Date(y, m - 1, d)
  }
  return new Date(value)
}

/** Today's local date as "YYYY-MM-DD". */
export function todayISO() {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** "2026-11-02" → "2 Nov 2026" */
export function formatDate(value) {
  const d = parseDate(value)
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`
}

/** "2026-11-02" → { day: "2", month: "Nov" } for the date stamp. */
export function dateStamp(value) {
  const d = parseDate(value)
  return { day: String(d.getDate()), month: MONTHS_SHORT[d.getMonth()] }
}

/** "2026-11-02" → "November 2026" */
export function monthHeading(value) {
  const d = parseDate(value)
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

/** ISO timestamp → "25 Nov, 3:40 pm" (adds the year when it isn't this year). */
export function formatDateTime(value) {
  const d = parseDate(value)
  const h = d.getHours() % 12 || 12
  const ampm = d.getHours() < 12 ? 'am' : 'pm'
  const year = d.getFullYear() === new Date().getFullYear() ? '' : ` ${d.getFullYear()}`
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}${year}, ${h}:${pad(d.getMinutes())} ${ampm}`
}

export function firstName(name = '') {
  return name.trim().split(/\s+/)[0] ?? ''
}

export function initial(name = '') {
  return (name.trim()[0] ?? '?').toUpperCase()
}

/** plural(3, 'member') → "3 members" */
export function plural(n, word, many = `${word}s`) {
  return `${n} ${n === 1 ? word : many}`
}
