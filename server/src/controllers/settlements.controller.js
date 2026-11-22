const settlementsService = require('../services/settlements.service.js')

const list = async (req, res) => {
    res.json(await settlementsService.list(req.group.id, req.valid.query))
}

const create = async (req, res) => {
    const settlement = await settlementsService.create(req.group.id, req.user, req.valid.body)
    res.status(201).json({ settlement })
}

const remove = async (req, res) => {
    await settlementsService.remove(req.settlement, req.user)
    res.status(204).end()
}

module.exports = { list, create, remove }