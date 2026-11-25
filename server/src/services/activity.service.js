const activityRepo = require('../repositories/activity.repo.js')
const cursorLib = require('../lib/cursor.js')

// Activity cursors: { i: id }
const activityKey = (k) => cursorLib.isId(k.i)

async function list(groupId, { limit, cursor }) {
    const rows = await activityRepo.list({
        groupId, limit, cursor: cursor ? cursorLib.decode(cursor, activityKey) : null
    })
    return cursorLib.page(rows, limit, (a) => ({ i: a.id }))
}

module.exports = { list }