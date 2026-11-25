const {Router}=require('express')
const requireAuth=require('../middleware/auth')
const {requireMember,requireAdmin}=require('../middleware/requireMember.js')
const validators=require('../validators/groups.validators.js')
const controllers=require('../controllers/groups.controller.js')
const validate=require('../middleware/validate.js')
const expenseValidators = require('../validators/expense.validators.js')
const expenseControllers = require('../controllers/expenses.controller.js')
const balanceControllers = require('../controllers/balances.controller.js')
const settlementValidators = require('../validators/settlements.validators.js')
const settlementControllers = require('../controllers/settlements.controller.js')
const activityControllers = require('../controllers/activity.controller.js')

const router=Router()
router.use(requireAuth)

router.get('/',controllers.list)
router.post('/',validate({body:validators.createGroupSchema}),controllers.create)


router.get('/:id',requireMember,controllers.get)
router.patch('/:id',requireMember,requireAdmin,validate({body:validators.updateGroupSchema}),controllers.update)
router.delete('/:id',requireMember,requireAdmin,controllers.remove)


router.post('/:id/members',requireMember,validate({body:validators.addMemberSchema}),controllers.addMember)

router.delete("/:id/members/:userId",requireMember,validate({params:validators.memberParams}),controllers.removeMember)

router.get('/:id/expenses', requireMember, validate({ query: expenseValidators.listQuerySchema }), expenseControllers.list)
router.post('/:id/expenses', requireMember, validate({ body: expenseValidators.createExpenseSchema }), expenseControllers.create)

router.get('/:id/balances', requireMember, balanceControllers.balances)
router.get('/:id/simplify', requireMember, balanceControllers.simplify)

router.get('/:id/settlements', requireMember, validate({ query: settlementValidators.listQuerySchema }), settlementControllers.list)
router.post('/:id/settlements', requireMember, validate({ body: settlementValidators.createSettlementSchema }), settlementControllers.create)

router.get('/:id/activity', requireMember, validate({ query: settlementValidators.activityQuerySchema }), activityControllers.list)

module.exports=router


