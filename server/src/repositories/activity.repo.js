const { pool } = require('../config/db.js')

async function log({ groupId, actorId, action, entityType, entityId = null, payload = {} }, db = pool) {
    await db.query(
        `INSERT INTO activity_log(group_id,actor_id,action,entity_type,entity_id,payload)
        VALUES($1,$2,$3,$4,$5,$6)`,
        [groupId, actorId, action, entityType, entityId, JSON.stringify(payload)]
    )
}

const toActivity = (r) => ({
    id: r.id,
    groupId: r.group_id,
    actor: { id: r.actor_id, name: r.actor_name },
    action: r.action,
    entityType: r.entity_type,
    entityId: r.entity_id,
    payload: r.payload,
    createdAt: r.created_at
})

// Newest first. The log is append-only and ids grow with time, so id alone is the sort key.
async function list({ groupId, limit, cursor }) {
    const params = [groupId]
    let after = ''
    if (cursor) {
        params.push(cursor.i)
        after = 'AND a.id < $2'
    }
    params.push(limit + 1)

    const { rows } = await pool.query(
        `SELECT a.id,a.group_id,a.action,a.entity_type,a.entity_id,a.payload,a.created_at,
            u.id AS actor_id,u.name AS actor_name
        FROM activity_log a JOIN users u ON u.id=a.actor_id
        WHERE a.group_id=$1 ${after}
        ORDER BY a.id DESC
        LIMIT $${params.length}`,
        params
    )
    return rows.map(toActivity)
}

module.exports = { log, list }