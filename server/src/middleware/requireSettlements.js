const settlementsRepo = require('../repositories/settlements.repo.js')
const membersRepo = require('../repositories/members.repo.js')
const { badRequest, notFound, notAMember, forbidden } = require('../lib/errors.js')

// For /settlements/:id routes: 404 (no such settlement) -> 403 (not in its group).
// Leaves req.settlement and req.membership for the next handlers.
async function requireSettlementAccess(req, res, next) {
    const id = Number(req.params.id)
    if (!Number.isInteger(id) || id < 1) {
        throw badRequest('Invalid request')
    }

    const settlement = await settlementsRepo.findById(id)
    if (!settlement) {
        throw notFound('Settlement')
    }

    const member = await membersRepo.find(settlement.groupId, req.user.id)
    if (!member) {
        throw notAMember()
    }

    req.settlement = settlement
    req.membership = { role: member.role }
    next()
}

// Only the creator, the payer, the receiver or a group admin may undo a settlement.
async function requireSettlementEditor(req, res, next) {
    const s = req.settlement
    const me = req.user.id
    const allowed =
        req.membership.role === 'admin' || s.createdBy.id === me || s.from.id === me || s.to.id === me

    if (!allowed) {
        throw forbidden('Only the people involved, whoever recorded it, or a group admin can undo this payment')
    }
    next()
}

module.exports = { requireSettlementAccess, requireSettlementEditor }