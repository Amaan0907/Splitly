const { pool } = require('../config/db.js')

const SETTLEMENT_SELECT = `
    SELECT s.id, s.group_id, s.amount_cents, s.note, s.settled_at,
        f.id AS from_id, f.name AS from_name,
        t.id AS to_id, t.name AS to_name,
        c.id AS creator_id, c.name AS creator_name
    FROM settlements s
    JOIN users f ON f.id = s.from_user_id
    JOIN users t ON t.id = s.to_user_id
    JOIN users c ON c.id = s.created_by`

const toSettlement = (r) => ({
    id: r.id,
    groupId: r.group_id,
    from: { id: r.from_id, name: r.from_name },
    to: { id: r.to_id, name: r.to_name },
    amountCents: r.amount_cents,
    note: r.note,
    settledAt: r.settled_at,
    createdBy: { id: r.creator_id, name: r.creator_name }
})

async function findById(id, db = pool) {
    const { rows } = await db.query(`${SETTLEMENT_SELECT} WHERE s.id = $1`, [id])
    return rows[0] ? toSettlement(rows[0]) : null
}

// Newest first. `cursor` is { t: ISO timestamp, i: id } of the last item already shown.
async function list({ groupId, limit, cursor, involving }) {
    const params = [groupId]
    const where = ['s.group_id = $1']

    if (involving) {
        params.push(involving)
        where.push(`(s.from_user_id = $${params.length} OR s.to_user_id = $${params.length})`)
    }
    if (cursor) {
        params.push(cursor.t, cursor.i)
        where.push(`(s.settled_at, s.id) < ($${params.length - 1}::timestamptz, $${params.length})`)
    }
    params.push(limit + 1)

    const { rows } = await pool.query(
        `${SETTLEMENT_SELECT}
        WHERE ${where.join(' AND ')}
        ORDER BY s.settled_at DESC, s.id DESC
        LIMIT $${params.length}`,
        params
    )
    return rows.map(toSettlement)
}

// settled_at is cut to milliseconds: that is all a JS Date holds, so the cursor
// (built from the Date) matches the stored value exactly.
async function insert({ groupId, fromUserId, toUserId, amountCents, note, settledAt, createdBy }, db = pool) {
    const { rows } = await db.query(
        `INSERT INTO settlements (group_id, from_user_id, to_user_id, amount_cents, note, settled_at, created_by)
        VALUES ($1, $2, $3, $4, $5, date_trunc('milliseconds', COALESCE($6::timestamptz, now())), $7)
        RETURNING id`,
        [groupId, fromUserId, toUserId, amountCents, note, settledAt, createdBy]
    )
    return rows[0].id
}

// Undo is a real delete (the activity log keeps a copy). False if it was already gone.
async function remove(id, db = pool) {
    const { rowCount } = await db.query('DELETE FROM settlements WHERE id = $1', [id])
    return rowCount === 1
}

module.exports = { findById, list, insert, remove }