const activityService = require('../services/activity.service.js')

const list = async (req, res) => {
    res.json(await activityService.list(req.group.id, req.valid.query))
}

module.exports = { list }