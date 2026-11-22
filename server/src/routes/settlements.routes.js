const { Router } = require('express')
const requireAuth = require('../middleware/auth')
const { requireSettlementAccess, requireSettlementEditor } = require('../middleware/requireSettlement.js')
const controllers = require('../controllers/settlements.controller.js')

const router = Router()
router.use(requireAuth)

router.delete('/:id', requireSettlementAccess, requireSettlementEditor, controllers.remove)

module.exports = router