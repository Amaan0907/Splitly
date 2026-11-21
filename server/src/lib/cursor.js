const { badRequest } = require('./errors.js')
const { isRealDate } = require('./dates.js')

// A cursor is the sort key of the last item on a page, wrapped so clients treat it as opaque.
const encode = (key) => Buffer.from(JSON.stringify(key)).toString('base64url')

const isId = (i) => Number.isSafeInteger(i) && i > 0

// Expenses page by { d: 'YYYY-MM-DD', i: id }. Other lists pass their own check.
const expenseKey = (k) => isRealDate(k.d) && isId(k.i)

function decode(cursor, isValid = expenseKey) {
    try {
        const key = JSON.parse(Buffer.from(cursor, 'base64url').toString())
        if (key && typeof key === 'object' && isValid(key)) return key
    } catch (error) {
        // fall through to the error below
    }
    throw badRequest('Invalid cursor', [{ path: 'cursor', message: 'Invalid cursor' }])
}

// `rows` holds up to limit+1 items: the extra one only tells us another page exists.
function page(rows, limit, keyOf) {
    const items = rows.slice(0, limit)
    const nextCursor = rows.length > limit ? encode(keyOf(items[items.length - 1])) : null
    return { items, nextCursor }
}

module.exports = { encode, decode, page, isId }
