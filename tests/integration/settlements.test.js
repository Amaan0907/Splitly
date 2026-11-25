const request = require('supertest');
const app = require('../../server/src/app.js');
const activity = require('../../server/src/repositories/activity.repo.js');
const settlementsRepo = require('../../server/src/repositories/settlements.repo.js');
const { withTransaction } = require('../../server/src/config/db.js');
const { pool, resetDb, closeDb } = require('../helpers/db.js');
const { signUp } = require('../helpers/auth.js');

beforeEach(resetDb);
afterAll(closeDb);
afterEach(() => jest.restoreAllMocks());

async function setup() {
    const aisha = await signUp('Aisha'); // admin
    const rahul = await signUp('Rahul');
    const meera = await signUp('Meera');
    const kabir = await signUp('Kabir');
    const dev = await signUp('Dev'); // not in the group
    const res = await aisha.agent.post('/api/groups').send({ name: 'Goa Trip' });
    const group = res.body.group;
    for (const who of [rahul, meera, kabir]) {
        await aisha.agent.post(`/api/groups/${group.id}/members`).send({ email: who.user.email });
    }
    return { aisha, rahul, meera, kabir, dev, group };
}

const id = (who) => who.user.id;
const named = (who) => ({ id: who.user.id, name: who.user.name });

const pay = (by, groupId, from, to, amountCents, extra = {}) =>
    by.agent.post(`/api/groups/${groupId}/settlements`).send({ fromUserId: id(from), toUserId: id(to), amountCents, ...extra });

async function payOk(by, groupId, from, to, amountCents, extra) {
    const res = await pay(by, groupId, from, to, amountCents, extra);
    expect(res.status).toBe(201);
    return res.body.settlement;
}

// PRD example: Aisha +200, Rahul -25, Meera -175 (Kabir not involved)
async function prdExample(ctx) {
    const add = (payer, amountCents, among) =>
        payer.agent.post(`/api/groups/${ctx.group.id}/expenses`).send({
            description: 'Test', amountCents, paidBy: id(payer), splitType: 'equal',
            expenseDate: '2026-11-02', splits: among.map((w) => ({ userId: id(w) })),
        });
    expect((await add(ctx.aisha, 30000, [ctx.aisha, ctx.rahul, ctx.meera])).status).toBe(201);
    expect((await add(ctx.rahul, 15000, [ctx.rahul, ctx.meera])).status).toBe(201);
}

async function netOf(ctx) {
    const res = await ctx.aisha.agent.get(`/api/groups/${ctx.group.id}/balances`);
    return Object.fromEntries(res.body.members.map((m) => [m.user.name, m.netCents]));
}

const listUrl = (ctx, query = '') => `/api/groups/${ctx.group.id}/settlements${query}`;

describe('POST /api/groups/:id/settlements', () => {
    test('201 with the full settlement shape', async () => {
        const ctx = await setup();
        const before = Date.now();
        const res = await pay(ctx.meera, ctx.group.id, ctx.meera, ctx.aisha, 17500, { note: '  UPI  ' });

        expect(res.status).toBe(201);
        expect(res.body.settlement).toEqual({
            id: expect.any(Number),
            groupId: ctx.group.id,
            from: named(ctx.meera),
            to: named(ctx.aisha),
            amountCents: 17500,
            note: 'UPI',
            settledAt: expect.any(String),
            createdBy: named(ctx.meera),
        });
        const settledAt = Date.parse(res.body.settlement.settledAt);
        expect(settledAt).toBeGreaterThanOrEqual(before - 1000);
        expect(settledAt).toBeLessThanOrEqual(Date.now() + 1000);
    });

    test('balances update immediately', async () => {
        const ctx = await setup();
        await prdExample(ctx);
        await payOk(ctx.meera, ctx.group.id, ctx.meera, ctx.aisha, 17500);
        expect(await netOf(ctx)).toEqual({ Aisha: 2500, Meera: 0, Kabir: 0, Rahul: -2500 });
    });

    test('paying more than owed is allowed and flips the balance (decision D1)', async () => {
        const ctx = await setup();
        await prdExample(ctx);
        await payOk(ctx.rahul, ctx.group.id, ctx.rahul, ctx.aisha, 5000);
        expect((await netOf(ctx)).Rahul).toBe(2500);
    });

    test('any member can record a payment between two others (decision D6)', async () => {
        const ctx = await setup();
        const s = await payOk(ctx.kabir, ctx.group.id, ctx.rahul, ctx.meera, 1000);
        expect(s.createdBy).toEqual(named(ctx.kabir));
        expect(s.from).toEqual(named(ctx.rahul));
    });

    test('recording every suggested payment settles the group', async () => {
        const ctx = await setup();
        await prdExample(ctx);
        const { transfers } = (await ctx.aisha.agent.get(`/api/groups/${ctx.group.id}/simplify`)).body;
        for (const t of transfers) {
            const res = await ctx.aisha.agent.post(`/api/groups/${ctx.group.id}/settlements`)
                .send({ fromUserId: t.from.id, toUserId: t.to.id, amountCents: t.amountCents });
            expect(res.status).toBe(201);
        }
        expect(Object.values(await netOf(ctx))).toEqual([0, 0, 0, 0]);
    });

    test('a past settledAt is kept; an offset is converted to UTC', async () => {
        const ctx = await setup();
        const a = await payOk(ctx.rahul, ctx.group.id, ctx.rahul, ctx.aisha, 100, { settledAt: '2026-11-05T10:00:00.000Z' });
        const b = await payOk(ctx.rahul, ctx.group.id, ctx.rahul, ctx.aisha, 100, { settledAt: '2026-11-05T15:30:00+05:30' });
        expect(a.settledAt).toBe('2026-11-05T10:00:00.000Z');
        expect(b.settledAt).toBe('2026-11-05T10:00:00.000Z');
    });

    test('a future or invalid settledAt -> 400 (decision D8)', async () => {
        const ctx = await setup();
        const tomorrow = new Date(Date.now() + 86400000).toISOString();
        for (const settledAt of [tomorrow, '2026-11-05', 'yesterday', 12345]) {
            const res = await pay(ctx.rahul, ctx.group.id, ctx.rahul, ctx.aisha, 100, { settledAt });
            expect(res.status).toBe(400);
            expect(res.body.error.details[0].path).toBe('settledAt');
        }
    });

    test('paying yourself -> 400', async () => {
        const ctx = await setup();
        const res = await pay(ctx.rahul, ctx.group.id, ctx.rahul, ctx.rahul, 100);
        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe('VALIDATION_ERROR');
        expect(res.body.error.details[0].path).toBe('toUserId');
    });

    test('payer or receiver not in the group -> 400 naming the field', async () => {
        const ctx = await setup();
        const a = await pay(ctx.rahul, ctx.group.id, ctx.dev, ctx.aisha, 100);
        expect(a.status).toBe(400);
        expect(a.body.error.details).toEqual([{ path: 'fromUserId', message: 'Not a member of this group' }]);

        const b = await pay(ctx.rahul, ctx.group.id, ctx.rahul, ctx.dev, 100);
        expect(b.status).toBe(400);
        expect(b.body.error.details).toEqual([{ path: 'toUserId', message: 'Not a member of this group' }]);
    });

    test('bad amounts -> 400', async () => {
        const ctx = await setup();
        for (const amountCents of [0, -5, 10.5, '100', 1_000_000_001, null]) {
            const res = await pay(ctx.rahul, ctx.group.id, ctx.rahul, ctx.aisha, amountCents);
            expect(res.status).toBe(400);
        }
        expect((await pay(ctx.rahul, ctx.group.id, ctx.rahul, ctx.aisha, 1_000_000_000)).status).toBe(201);
    });

    test('missing fields, unknown fields and a long note -> 400', async () => {
        const ctx = await setup();
        const url = `/api/groups/${ctx.group.id}/settlements`;
        expect((await ctx.rahul.agent.post(url).send({ fromUserId: id(ctx.rahul), amountCents: 100 })).status).toBe(400);
        expect((await pay(ctx.rahul, ctx.group.id, ctx.rahul, ctx.aisha, 100, { method: 'UPI' })).status).toBe(400);
        expect((await pay(ctx.rahul, ctx.group.id, ctx.rahul, ctx.aisha, 100, { note: 'x'.repeat(101) })).status).toBe(400);
    });

    test('an empty note is stored as null', async () => {
        const ctx = await setup();
        const s = await payOk(ctx.rahul, ctx.group.id, ctx.rahul, ctx.aisha, 100, { note: '   ' });
        expect(s.note).toBeNull();
    });

    test('401 logged out, 403 non-member (even with a bad body), 404 missing group', async () => {
        const ctx = await setup();
        const body = { fromUserId: id(ctx.rahul), toUserId: id(ctx.aisha), amountCents: 100 };
        expect((await request(app).post(listUrl(ctx)).send(body)).status).toBe(401);

        const outsider = await ctx.dev.agent.post(listUrl(ctx)).send({ nonsense: true });
        expect(outsider.status).toBe(403);
        expect(outsider.body.error.code).toBe('NOT_A_MEMBER');

        expect((await ctx.aisha.agent.post('/api/groups/999999/settlements').send(body)).status).toBe(404);
    });

    test('writes a settlement.created activity entry', async () => {
        const ctx = await setup();
        const s = await payOk(ctx.kabir, ctx.group.id, ctx.meera, ctx.aisha, 17500);
        const { rows } = await pool.query(
            "SELECT actor_id, entity_id, payload FROM activity_log WHERE action = 'settlement.created'"
        );
        expect(rows).toEqual([{
            actor_id: id(ctx.kabir),
            entity_id: s.id,
            payload: { from: named(ctx.meera), to: named(ctx.aisha), amountCents: 17500 },
        }]);
    });

    test('atomic: if the activity log fails, no settlement is saved', async () => {
        const ctx = await setup();
        jest.spyOn(activity, 'log').mockRejectedValueOnce(new Error('boom'));
        const res = await pay(ctx.rahul, ctx.group.id, ctx.rahul, ctx.aisha, 100);

        expect(res.status).toBe(500);
        const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM settlements');
        expect(rows[0].n).toBe(0);
    });

    test('the activity entry is written on the transaction, not on a separate connection', async () => {
        const ctx = await setup();
        const spy = jest.spyOn(activity, 'log');
        const s = await payOk(ctx.rahul, ctx.group.id, ctx.rahul, ctx.aisha, 100);
        await ctx.rahul.agent.delete(`/api/settlements/${s.id}`);

        expect(spy).toHaveBeenCalledTimes(2); // created + deleted
        for (const [, db] of spy.mock.calls) {
            expect(db).toBeDefined();
            expect(db).not.toBe(pool);
        }
    });
});

describe('GET /api/groups/:id/settlements', () => {
    test('empty group -> no items', async () => {
        const ctx = await setup();
        const res = await ctx.rahul.agent.get(listUrl(ctx));
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ items: [], nextCursor: null });
    });

    test('newest settledAt first; a backdated payment sorts by its date, not when it was entered', async () => {
        const ctx = await setup();
        const nov5 = await payOk(ctx.rahul, ctx.group.id, ctx.rahul, ctx.aisha, 100, { settledAt: '2026-11-05T10:00:00.000Z' });
        const now = await payOk(ctx.rahul, ctx.group.id, ctx.rahul, ctx.aisha, 200);
        const nov1 = await payOk(ctx.rahul, ctx.group.id, ctx.rahul, ctx.aisha, 300, { settledAt: '2026-11-01T10:00:00.000Z' });

        const res = await ctx.aisha.agent.get(listUrl(ctx));
        expect(res.body.items.map((s) => s.id)).toEqual([now.id, nov5.id, nov1.id]);
    });

    test('pages through everything exactly once, including payments with the same time', async () => {
        const ctx = await setup();
        const same = '2026-11-05T10:00:00.000Z';
        const created = [];
        for (let i = 0; i < 3; i++) created.push(await payOk(ctx.rahul, ctx.group.id, ctx.rahul, ctx.aisha, 100 + i, { settledAt: same }));
        created.push(await payOk(ctx.rahul, ctx.group.id, ctx.rahul, ctx.aisha, 200));
        created.push(await payOk(ctx.rahul, ctx.group.id, ctx.rahul, ctx.aisha, 300, { settledAt: '2026-10-01T00:00:00.000Z' }));

        const seen = [];
        let cursor = null;
        let pages = 0;
        do {
            const res = await ctx.aisha.agent.get(listUrl(ctx, `?limit=2${cursor ? `&cursor=${cursor}` : ''}`));
            expect(res.status).toBe(200);
            expect(res.body.items.length).toBeLessThanOrEqual(2);
            seen.push(...res.body.items.map((s) => s.id));
            cursor = res.body.nextCursor;
            pages++;
        } while (cursor);

        expect(pages).toBe(3);
        const [a, b, c, d, e] = created.map((s) => s.id);
        // now, then the three at the same time (higher id first), then October
        expect(seen).toEqual([d, c, b, a, e]);
    });

    test('two payments recorded in the same instant both appear across pages', async () => {
        const ctx = await setup();
        // now() is fixed inside one transaction, so both rows get exactly the same timestamp
        await withTransaction(async (db) => {
            for (const amountCents of [100, 200]) {
                await settlementsRepo.insert({
                    groupId: ctx.group.id, fromUserId: id(ctx.rahul), toUserId: id(ctx.aisha),
                    amountCents, note: null, settledAt: null, createdBy: id(ctx.rahul),
                }, db);
            }
        });

        const first = await ctx.aisha.agent.get(listUrl(ctx, '?limit=1'));
        const second = await ctx.aisha.agent.get(listUrl(ctx, `?limit=1&cursor=${first.body.nextCursor}`));
        expect([...first.body.items, ...second.body.items].map((s) => s.amountCents)).toEqual([200, 100]);
    });

    test('exactly `limit` items -> no next page', async () => {
        const ctx = await setup();
        await payOk(ctx.rahul, ctx.group.id, ctx.rahul, ctx.aisha, 100);
        await payOk(ctx.rahul, ctx.group.id, ctx.rahul, ctx.aisha, 200);
        const res = await ctx.aisha.agent.get(listUrl(ctx, '?limit=2'));
        expect(res.body.items).toHaveLength(2);
        expect(res.body.nextCursor).toBeNull();
    });

    test('involving filter: payments where the user paid or received', async () => {
        const ctx = await setup();
        const s1 = await payOk(ctx.rahul, ctx.group.id, ctx.rahul, ctx.aisha, 100);
        const s2 = await payOk(ctx.aisha, ctx.group.id, ctx.meera, ctx.rahul, 200);
        await payOk(ctx.aisha, ctx.group.id, ctx.meera, ctx.kabir, 300);

        const res = await ctx.aisha.agent.get(listUrl(ctx, `?involving=${id(ctx.rahul)}`));
        expect(res.body.items.map((s) => s.id).sort()).toEqual([s1.id, s2.id].sort());
    });

    test("only this group's settlements", async () => {
        const ctx = await setup();
        const other = (await ctx.rahul.agent.post('/api/groups').send({ name: 'Flat' })).body.group;
        await ctx.rahul.agent.post(`/api/groups/${other.id}/members`).send({ email: ctx.aisha.user.email });
        await payOk(ctx.rahul, other.id, ctx.rahul, ctx.aisha, 100);

        expect((await ctx.aisha.agent.get(listUrl(ctx))).body.items).toEqual([]);
    });

    test('bad query -> 400', async () => {
        const ctx = await setup();
        for (const q of ['?limit=0', '?limit=101', '?cursor=garbage', '?involving=abc', '?sort=asc']) {
            expect((await ctx.aisha.agent.get(listUrl(ctx, q))).status).toBe(400);
        }
        // a well-formed cursor from a different list (an expense cursor) is rejected too
        const expenseCursor = Buffer.from(JSON.stringify({ d: '2026-11-02', i: 1 })).toString('base64url');
        expect((await ctx.aisha.agent.get(listUrl(ctx, `?cursor=${expenseCursor}`))).status).toBe(400);
    });

    test('403 for a non-member, 401 logged out', async () => {
        const ctx = await setup();
        expect((await ctx.dev.agent.get(listUrl(ctx))).status).toBe(403);
        expect((await request(app).get(listUrl(ctx))).status).toBe(401);
    });
});

describe('DELETE /api/settlements/:id (undo)', () => {
    async function withPayment() {
        const ctx = await setup();
        await prdExample(ctx);
        // Meera pays Rahul, recorded by Kabir
        const s = await payOk(ctx.kabir, ctx.group.id, ctx.meera, ctx.rahul, 7500);
        return { ctx, s };
    }

    test('undo restores the balances and removes it from the list', async () => {
        const { ctx, s } = await withPayment();
        expect((await netOf(ctx)).Meera).toBe(-10000);

        expect((await ctx.meera.agent.delete(`/api/settlements/${s.id}`)).status).toBe(204);
        expect(await netOf(ctx)).toEqual({ Aisha: 20000, Kabir: 0, Rahul: -2500, Meera: -17500 });
        expect((await ctx.aisha.agent.get(listUrl(ctx))).body.items).toEqual([]);
    });

    test.each([
        ['the payer', 'meera'],
        ['the receiver', 'rahul'],
        ['whoever recorded it', 'kabir'],
        ['a group admin', 'aisha'],
    ])('%s can undo it', async (_, who) => {
        const { ctx, s } = await withPayment();
        expect((await ctx[who].agent.delete(`/api/settlements/${s.id}`)).status).toBe(204);
    });

    test('any other member -> 403 FORBIDDEN', async () => {
        const { ctx } = await withPayment();
        const s = await payOk(ctx.meera, ctx.group.id, ctx.meera, ctx.rahul, 100);
        const res = await ctx.kabir.agent.delete(`/api/settlements/${s.id}`);
        expect(res.status).toBe(403);
        expect(res.body.error.code).toBe('FORBIDDEN');
    });

    test('non-member -> 403 NOT_A_MEMBER; missing -> 404; bad id -> 400; twice -> 404', async () => {
        const { ctx, s } = await withPayment();
        const outsider = await ctx.dev.agent.delete(`/api/settlements/${s.id}`);
        expect(outsider.status).toBe(403);
        expect(outsider.body.error.code).toBe('NOT_A_MEMBER');

        expect((await ctx.aisha.agent.delete('/api/settlements/999999')).status).toBe(404);
        expect((await ctx.aisha.agent.delete('/api/settlements/abc')).status).toBe(400);
        expect((await ctx.aisha.agent.delete(`/api/settlements/${s.id}`)).status).toBe(204);
        expect((await ctx.aisha.agent.delete(`/api/settlements/${s.id}`)).status).toBe(404);
        expect((await request(app).delete(`/api/settlements/${s.id}`)).status).toBe(401);
    });

    test('the activity log keeps the full settlement', async () => {
        const { ctx, s } = await withPayment();
        await ctx.aisha.agent.delete(`/api/settlements/${s.id}`);

        const { rows } = await pool.query("SELECT actor_id, payload FROM activity_log WHERE action = 'settlement.deleted'");
        expect(rows).toHaveLength(1);
        expect(rows[0].actor_id).toBe(id(ctx.aisha));
        expect(rows[0].payload.settlement).toMatchObject({ id: s.id, amountCents: 7500, from: named(ctx.meera), to: named(ctx.rahul) });
    });

    test('atomic: if the activity log fails, the settlement is not deleted', async () => {
        const { ctx, s } = await withPayment();
        jest.spyOn(activity, 'log').mockRejectedValueOnce(new Error('boom'));
        expect((await ctx.aisha.agent.delete(`/api/settlements/${s.id}`)).status).toBe(500);
        expect((await ctx.aisha.agent.get(listUrl(ctx))).body.items).toHaveLength(1);
    });
});

describe('settle up, then leave (decision D2 end to end)', () => {
    test('a member who owes is blocked, pays through the API, then can be removed', async () => {
        const ctx = await setup();
        await prdExample(ctx);
        const url = `/api/groups/${ctx.group.id}/members/${id(ctx.meera)}`;

        expect((await ctx.aisha.agent.delete(url)).status).toBe(409);
        await payOk(ctx.meera, ctx.group.id, ctx.meera, ctx.aisha, 17500);
        expect((await ctx.aisha.agent.delete(url)).status).toBe(204);
    });
});