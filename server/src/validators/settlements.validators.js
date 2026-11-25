const { z } = require('zod')

const id = z.number().int().positive()

// ISO timestamp with Z or an offset; a payment cannot happen in the future (decision D8)
const settledAt = z.iso.datetime({ offset: true })
    .refine((t) => Date.parse(t) <= Date.now(), 'Date cannot be in the future')

const createSettlementSchema = z.strictObject({
    fromUserId: id,
    toUserId: id,
    amountCents: z.int().min(1).max(1_000_000_000),
    note: z.string().trim().max(100).optional(),
    settledAt: settledAt.optional()
}).refine((b) => b.fromUserId !== b.toUserId, { message: 'Payer and receiver must be different people', path: ['toUserId'] })

const listQuerySchema = z.strictObject({
    limit: z.coerce.number().int().min(1).max(100).default(20),
    cursor: z.string().min(1).optional(),
    involving: z.coerce.number().int().positive().optional()
})

const activityQuerySchema = z.strictObject({
    limit: z.coerce.number().int().min(1).max(100).default(20),
    cursor: z.string().min(1).optional()
})

module.exports = { createSettlementSchema, listQuerySchema, activityQuerySchema }
