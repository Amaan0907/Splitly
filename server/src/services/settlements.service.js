const { withTransaction } = require('../config/db.js')
const settlementsRepo = require('../repositories/settlements.repo.js')
const membersRepo = require('../repositories/members.repo.js')
const activity = require('../repositories/activity.repo.js')
const cursorLib = require('../lib/cursor.js')
const { badRequest, notFound } = require('../lib/errors.js')

// Settlement cursors: { t: exact ISO timestamp, i: id }
const isIsoTimestamp = (t) => typeof t === 'string' && !Number.isNaN(Date.parse(t)) && new Date(t).toISOString() === t
const settlementKey = (k) => isIsoTimestamp(k.t) && cursorLib.isId(k.i)

// Decision D6: any member may record a payment between any two current members.
// Decision D1: the amount may be more than what is owed; the balance just flips.
async function create(groupId, user, body) {
    const { fromUserId, toUserId, amountCents } = body
    const members = await membersRepo.filterMembers(groupId, [fromUserId, toUserId])
    for (const [path, userId] of [['fromUserId', fromUserId], ['toUserId', toUserId]]) {
        if (!members.has(userId)) {
            throw badRequest('Both people must be members of this group', [{ path, message: 'Not a member of this group' }])
        }
    }

    return withTransaction(async (db) => {
        const id = await settlementsRepo.insert({
            groupId, fromUserId, toUserId, amountCents,
            note: body.note || null,
            settledAt: body.settledAt ?? null,
            createdBy: user.id
        }, db)
        const settlement = await settlementsRepo.findById(id, db)
        await activity.log({
            groupId, actorId: user.id, action: 'settlement.created', entityType: 'settlement', entityId: id,
            payload: { from: settlement.from, to: settlement.to, amountCents }
        }, db)
        return settlement
    })
}

async function list(groupId, query) {
    const { limit, cursor, involving } = query
    const rows = await settlementsRepo.list({
        groupId, limit, involving, cursor: cursor ? cursorLib.decode(cursor, settlementKey) : null
    })
    return cursorLib.page(rows, limit, (s) => ({ t: s.settledAt.toISOString(), i: s.id }))
}

// Undo: delete the row; the full settlement stays in the activity payload.
async function remove(settlement, user) {
    await withTransaction(async (db) => {
        if (!(await settlementsRepo.remove(settlement.id, db))) throw notFound('Settlement')
        await activity.log({
            groupId: settlement.groupId, actorId: user.id, action: 'settlement.deleted', entityType: 'settlement',
            entityId: settlement.id, payload: { settlement }
        }, db)
    })
}

module.exports = { create, list, remove }
