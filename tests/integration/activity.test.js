const request = require('supertest');
const app = require('../../server/src/app.js');
const { resetDb, closeDb } = require('../helpers/db.js');
const { signUp } = require('../helpers/auth.js');

beforeEach(resetDb);
afterAll(closeDb);

async function setup() {
    const aisha = await signUp('Aisha');
    const rahul = await signUp('Rahul');
    const dev = await signUp('Dev');
    const group = (await aisha.agent.post('/api/groups').send({ name: 'Goa Trip' })).body.group;
    await aisha.agent.post(`/api/groups/${group.id}/members`).send({ email: rahul.user.email });
    return { aisha, rahul, dev, group };
}

const named = (who) => ({ id: who.user.id, name: who.user.name });
const feed = (who, groupId, query = '') => who.agent.get(`/api/groups/${groupId}/activity${query}`);

async function addExpense(ctx) {
    const res = await ctx.rahul.agent.post(`/api/groups/${ctx.group.id}/expenses`).send({
        description: 'Dinner', amountCents: 3000, paidBy: ctx.rahul.user.id, splitType: 'equal',
        expenseDate: '2026-11-02', splits: [{ userId: ctx.aisha.user.id }, { userId: ctx.rahul.user.id }],
    });
    expect(res.status).toBe(201);
    return res.body.expense;
}

describe('GET /api/groups/:id/activity', () => {
    test('a new group starts with group.created and member.added', async () => {
        const ctx = await setup();
        const res = await feed(ctx.rahul, ctx.group.id);

        expect(res.status).toBe(200);
        expect(res.body.nextCursor).toBeNull();
        expect(res.body.items.map((a) => a.action)).toEqual(['member.added', 'group.created']);
        expect(res.body.items[1]).toEqual({
            id: expect.any(Number),
            groupId: ctx.group.id,
            actor: named(ctx.aisha),
            action: 'group.created',
            entityType: 'group',
            entityId: ctx.group.id,
            payload: { name: 'Goa Trip' },
            createdAt: expect.any(String),
        });
    });

    test('newest first, with who did what; deleted expenses stay in the history', async () => {
        const ctx = await setup();
        const expense = await addExpense(ctx);
        await ctx.aisha.agent.post(`/api/groups/${ctx.group.id}/settlements`)
            .send({ fromUserId: ctx.aisha.user.id, toUserId: ctx.rahul.user.id, amountCents: 1500 });
        await ctx.rahul.agent.delete(`/api/expenses/${expense.id}`);

        const { items } = (await feed(ctx.aisha, ctx.group.id)).body;
        expect(items.map((a) => [a.action, a.actor.name])).toEqual([
            ['expense.deleted', 'Rahul'],
            ['settlement.created', 'Aisha'],
            ['expense.created', 'Rahul'],
            ['member.added', 'Aisha'],
            ['group.created', 'Aisha'],
        ]);
        expect(items[0].payload).toEqual({ description: 'Dinner', amountCents: 3000 });
    });

    test('pages through everything exactly once', async () => {
        const ctx = await setup();
        for (let i = 0; i < 3; i++) await addExpense(ctx); // 5 entries in total

        const all = (await feed(ctx.aisha, ctx.group.id)).body.items.map((a) => a.id);
        const seen = [];
        let cursor = null;
        do {
            const res = await feed(ctx.aisha, ctx.group.id, `?limit=2${cursor ? `&cursor=${cursor}` : ''}`);
            expect(res.status).toBe(200);
            seen.push(...res.body.items.map((a) => a.id));
            cursor = res.body.nextCursor;
        } while (cursor);

        expect(all).toHaveLength(5);
        expect(seen).toEqual(all);
    });

    test('exactly `limit` entries -> no next page', async () => {
        const ctx = await setup(); // group.created + member.added
        const res = await feed(ctx.aisha, ctx.group.id, '?limit=2');
        expect(res.body.items).toHaveLength(2);
        expect(res.body.nextCursor).toBeNull();
    });

    test("only this group's activity", async () => {
        const ctx = await setup();
        await ctx.aisha.agent.post('/api/groups').send({ name: 'Other' });
        const { items } = (await feed(ctx.aisha, ctx.group.id)).body;
        expect(items.every((a) => a.groupId === ctx.group.id)).toBe(true);
        expect(items).toHaveLength(2);
    });

    test('bad query -> 400; non-member -> 403; logged out -> 401; missing group -> 404', async () => {
        const ctx = await setup();
        for (const q of ['?limit=0', '?limit=101', '?cursor=garbage', '?q=x']) {
            expect((await feed(ctx.aisha, ctx.group.id, q)).status).toBe(400);
        }
        expect((await feed(ctx.dev, ctx.group.id)).status).toBe(403);
        expect((await request(app).get(`/api/groups/${ctx.group.id}/activity`)).status).toBe(401);
        expect((await feed(ctx.aisha, 999999)).status).toBe(404);
    });
});