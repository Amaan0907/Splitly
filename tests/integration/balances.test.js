const request = require('supertest');
const app = require('../../server/src/app.js');
const { pool, resetDb, closeDb } = require('../helpers/db.js');
const { signUp } = require('../helpers/auth.js');

beforeEach(resetDb);
afterAll(closeDb);

async function setup() {
    const aisha = await signUp('Aisha');
    const rahul = await signUp('Rahul');
    const meera = await signUp('Meera');
    const dev = await signUp('Dev');
    const group = await newGroup(aisha, 'Goa Trip', [rahul, meera]);
    return { aisha, rahul, meera, dev, group };
}

async function newGroup(owner, name, members = [], currency = 'INR') {
    const res = await owner.agent.post('/api/groups').send({ name, currency });
    for (const who of members) {
        await owner.agent.post(`/api/groups/${res.body.group.id}/members`).send({ email: who.user.email });
    }
    return res.body.group;
}

const id = (who) => who.user.id;
const named = (who) => ({ id: who.user.id, name: who.user.name });
const sum = (arr) => arr.reduce((a, b) => a + b, 0);

// Equal split paid by `payer` among `among`
async function expense(payer, groupId, amountCents, among) {
    const res = await payer.agent.post(`/api/groups/${groupId}/expenses`).send({
        description: 'Test expense',
        amountCents,
        paidBy: id(payer),
        splitType: 'equal',
        expenseDate: '2026-11-02',
        splits: among.map((w) => ({ userId: id(w) })),
    });
    expect(res.status).toBe(201);
    return res.body.expense;
}

// Settlements have no API yet (next feature), so tests write them straight into the table.
const settle = (groupId, from, to, amountCents) =>
    pool.query(
        'INSERT INTO settlements (group_id, from_user_id, to_user_id, amount_cents, created_by) VALUES ($1, $2, $3, $4, $2)',
        [groupId, id(from), id(to), amountCents]
    );

// PRD example: Aisha pays 300 for all three; Rahul pays 150 for Rahul and Meera.
// Balances: Aisha +200, Rahul -25, Meera -175.
async function prdExample(ctx) {
    const dinner = await expense(ctx.aisha, ctx.group.id, 30000, [ctx.aisha, ctx.rahul, ctx.meera]);
    const cab = await expense(ctx.rahul, ctx.group.id, 15000, [ctx.rahul, ctx.meera]);
    return { dinner, cab };
}

const getBalances = (who, groupId) => who.agent.get(`/api/groups/${groupId}/balances`);
const getSimplify = (who, groupId) => who.agent.get(`/api/groups/${groupId}/simplify`);

async function netOf(ctx) {
    const res = await getBalances(ctx.aisha, ctx.group.id);
    return Object.fromEntries(res.body.members.map((m) => [m.user.name, m.netCents]));
}

describe('GET /api/groups/:id/balances', () => {
    test('new group: every member at 0, no debts', async () => {
        const ctx = await setup();
        const res = await getBalances(ctx.aisha, ctx.group.id);

        expect(res.status).toBe(200);
        expect(res.body).toEqual({
            currency: 'INR',
            members: [
                { user: named(ctx.aisha), netCents: 0 },
                { user: named(ctx.rahul), netCents: 0 },
                { user: named(ctx.meera), netCents: 0 },
            ],
            pairwise: [],
        });
    });

    test('PRD example: A +200, B -25, C -175 with pairwise debts', async () => {
        const ctx = await setup();
        await prdExample(ctx);
        const res = await getBalances(ctx.rahul, ctx.group.id);

        expect(res.status).toBe(200);
        expect(res.body.members).toEqual([
            { user: named(ctx.aisha), netCents: 20000 },
            { user: named(ctx.rahul), netCents: -2500 },
            { user: named(ctx.meera), netCents: -17500 },
        ]);
        expect(res.body.pairwise).toEqual([
            { from: named(ctx.rahul), to: named(ctx.aisha), amountCents: 10000 },
            { from: named(ctx.meera), to: named(ctx.aisha), amountCents: 10000 },
            { from: named(ctx.meera), to: named(ctx.rahul), amountCents: 7500 },
        ]);
        expect(sum(res.body.members.map((m) => m.netCents))).toBe(0);
    });

    test('the payer does not have to be in the split', async () => {
        const ctx = await setup();
        await expense(ctx.aisha, ctx.group.id, 9000, [ctx.rahul, ctx.meera]);
        expect(await netOf(ctx)).toEqual({ Aisha: 9000, Rahul: -4500, Meera: -4500 });
    });

    test('leftover cents still add up to zero', async () => {
        const ctx = await setup();
        await expense(ctx.meera, ctx.group.id, 10001, [ctx.aisha, ctx.rahul, ctx.meera]);
        // shares 3334 / 3334 / 3333 (extra cents to the lowest ids)
        expect(await netOf(ctx)).toEqual({ Meera: 6668, Aisha: -3334, Rahul: -3334 });
    });

    test('a deleted expense no longer counts', async () => {
        const ctx = await setup();
        const { dinner } = await prdExample(ctx);
        expect((await ctx.aisha.agent.delete(`/api/expenses/${dinner.id}`)).status).toBe(204);

        expect(await netOf(ctx)).toEqual({ Rahul: 7500, Aisha: 0, Meera: -7500 });
        // myNetCents (a different query) must skip it too
        const myNet = async (who) => (await who.agent.get(`/api/groups/${ctx.group.id}`)).body.group.myNetCents;
        expect([await myNet(ctx.aisha), await myNet(ctx.rahul), await myNet(ctx.meera)]).toEqual([0, 7500, -7500]);
    });

    test('an edited expense is reflected immediately', async () => {
        const ctx = await setup();
        const { cab } = await prdExample(ctx);
        const res = await ctx.rahul.agent.patch(`/api/expenses/${cab.id}`).send({
            amountCents: 30000,
            splitType: 'equal',
            splits: [{ userId: id(ctx.rahul) }, { userId: id(ctx.meera) }],
        });
        expect(res.status).toBe(200);

        expect(await netOf(ctx)).toEqual({ Aisha: 20000, Rahul: 5000, Meera: -25000 });
    });

    test('settlements count: paying back what you owe brings you to 0', async () => {
        const ctx = await setup();
        await prdExample(ctx);
        await settle(ctx.group.id, ctx.meera, ctx.aisha, 17500);

        expect(await netOf(ctx)).toEqual({ Aisha: 2500, Meera: 0, Rahul: -2500 });
    });

    test('paying more than you owe flips your balance (decision D1)', async () => {
        const ctx = await setup();
        await prdExample(ctx);
        await settle(ctx.group.id, ctx.rahul, ctx.aisha, 5000);

        expect(await netOf(ctx)).toEqual({ Aisha: 15000, Rahul: 2500, Meera: -17500 });
    });

    test("another group's expenses and settlements do not leak in", async () => {
        const ctx = await setup();
        await prdExample(ctx);
        const other = await newGroup(ctx.aisha, 'Flat', [ctx.rahul]);
        await expense(ctx.rahul, other.id, 99900, [ctx.aisha, ctx.rahul]);
        await settle(other.id, ctx.aisha, ctx.rahul, 100);

        expect(await netOf(ctx)).toEqual({ Aisha: 20000, Rahul: -2500, Meera: -17500 });
    });

    test('a former member with a balance is still listed; one at 0 is not', async () => {
        const ctx = await setup();
        await prdExample(ctx);
        // bypass decision D2 to simulate a member who left while owing money
        await pool.query('DELETE FROM group_members WHERE group_id = $1 AND user_id = $2', [ctx.group.id, id(ctx.meera)]);
        await ctx.aisha.agent.post(`/api/groups/${ctx.group.id}/members`).send({ email: ctx.dev.user.email });
        expect((await ctx.aisha.agent.delete(`/api/groups/${ctx.group.id}/members/${id(ctx.dev)}`)).status).toBe(204);

        const res = await getBalances(ctx.aisha, ctx.group.id);
        expect(res.body.members.map((m) => m.user.name)).toEqual(['Aisha', 'Rahul', 'Meera']);
        expect(res.body.pairwise.some((p) => p.from.name === 'Meera')).toBe(true);
    });

    test('401 when logged out', async () => {
        const ctx = await setup();
        const res = await request(app).get(`/api/groups/${ctx.group.id}/balances`);
        expect(res.status).toBe(401);
    });

    test('403 NOT_A_MEMBER for someone outside the group', async () => {
        const ctx = await setup();
        const res = await getBalances(ctx.dev, ctx.group.id);
        expect(res.status).toBe(403);
        expect(res.body.error.code).toBe('NOT_A_MEMBER');
    });

    test('404 for a group that does not exist', async () => {
        const ctx = await setup();
        expect((await getBalances(ctx.aisha, 999999)).status).toBe(404);
    });
});

describe('GET /api/groups/:id/simplify', () => {
    test('PRD example: 3 pairwise debts become 2 payments', async () => {
        const ctx = await setup();
        await prdExample(ctx);
        const res = await getSimplify(ctx.meera, ctx.group.id);

        expect(res.status).toBe(200);
        expect(res.body).toEqual({
            currency: 'INR',
            transfers: [
                { from: named(ctx.meera), to: named(ctx.aisha), amountCents: 17500 },
                { from: named(ctx.rahul), to: named(ctx.aisha), amountCents: 2500 },
            ],
            pairwiseCount: 3,
            simplifiedCount: 2,
        });
    });

    test('settled group: no transfers', async () => {
        const ctx = await setup();
        const res = await getSimplify(ctx.aisha, ctx.group.id);
        expect(res.body).toEqual({ currency: 'INR', transfers: [], pairwiseCount: 0, simplifiedCount: 0 });
    });

    test('a cycle of equal debts needs no payments', async () => {
        const ctx = await setup();
        await expense(ctx.aisha, ctx.group.id, 1000, [ctx.rahul]); // Rahul owes Aisha
        await expense(ctx.rahul, ctx.group.id, 1000, [ctx.meera]); // Meera owes Rahul
        await expense(ctx.meera, ctx.group.id, 1000, [ctx.aisha]); // Aisha owes Meera

        const res = await getSimplify(ctx.aisha, ctx.group.id);
        expect(res.body.transfers).toEqual([]);
        expect(res.body.pairwiseCount).toBe(3);
    });

    test('recording every suggested payment settles the group', async () => {
        const ctx = await setup();
        await prdExample(ctx);
        await expense(ctx.meera, ctx.group.id, 4567, [ctx.aisha, ctx.rahul, ctx.meera]);

        const { transfers } = (await getSimplify(ctx.aisha, ctx.group.id)).body;
        const who = { [id(ctx.aisha)]: ctx.aisha, [id(ctx.rahul)]: ctx.rahul, [id(ctx.meera)]: ctx.meera };
        for (const t of transfers) await settle(ctx.group.id, who[t.from.id], who[t.to.id], t.amountCents);

        expect(Object.values(await netOf(ctx))).toEqual([0, 0, 0]);
        expect((await getSimplify(ctx.aisha, ctx.group.id)).body.transfers).toEqual([]);
    });

    test('403 for a non-member, 401 when logged out', async () => {
        const ctx = await setup();
        expect((await getSimplify(ctx.dev, ctx.group.id)).status).toBe(403);
        expect((await request(app).get(`/api/groups/${ctx.group.id}/simplify`)).status).toBe(401);
    });
});

describe('myNetCents on groups', () => {
    test('GET /api/groups shows each caller their own balance', async () => {
        const ctx = await setup();
        await prdExample(ctx);
        const mine = async (who) => (await who.agent.get('/api/groups')).body.items[0].myNetCents;

        expect(await mine(ctx.aisha)).toBe(20000);
        expect(await mine(ctx.rahul)).toBe(-2500);
        expect(await mine(ctx.meera)).toBe(-17500);
    });

    test('GET and PATCH /api/groups/:id return the same balance as /balances', async () => {
        const ctx = await setup();
        await prdExample(ctx);
        await settle(ctx.group.id, ctx.meera, ctx.rahul, 1000);
        const fromBalances = (await netOf(ctx)).Meera;

        const get = await ctx.meera.agent.get(`/api/groups/${ctx.group.id}`);
        expect(get.body.group.myNetCents).toBe(fromBalances);

        const patch = await ctx.aisha.agent.patch(`/api/groups/${ctx.group.id}`).send({ name: 'Goa 2026' });
        expect(patch.body.group.myNetCents).toBe(20000);
    });
});

describe('GET /api/me/summary', () => {
    test('no groups: empty totals', async () => {
        const { agent } = await signUp('Solo');
        const res = await agent.get('/api/me/summary');
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ totals: [], groups: [] });
    });

    test('totals per currency; settled groups are left out', async () => {
        const ctx = await setup();
        await prdExample(ctx); // Aisha +20000 INR
        const flat = await newGroup(ctx.rahul, 'Flat', [ctx.aisha]);
        await expense(ctx.rahul, flat.id, 9000, [ctx.aisha, ctx.rahul]); // Aisha -4500 INR
        const usa = await newGroup(ctx.meera, 'USA', [ctx.aisha], 'USD');
        await expense(ctx.meera, usa.id, 1000, [ctx.aisha]); // Aisha -1000 USD
        await newGroup(ctx.aisha, 'Settled', [ctx.rahul]); // Aisha 0

        const res = await ctx.aisha.agent.get('/api/me/summary');
        expect(res.status).toBe(200);
        expect(res.body.totals).toEqual([
            { currency: 'INR', owedToYouCents: 20000, youOweCents: 4500, netCents: 15500 },
            { currency: 'USD', owedToYouCents: 0, youOweCents: 1000, netCents: -1000 },
        ]);
        expect(res.body.groups).toHaveLength(3);
        expect(res.body.groups).toEqual(
            expect.arrayContaining([
                { groupId: ctx.group.id, name: 'Goa Trip', currency: 'INR', netCents: 20000 },
                { groupId: flat.id, name: 'Flat', currency: 'INR', netCents: -4500 },
                { groupId: usa.id, name: 'USA', currency: 'USD', netCents: -1000 },
            ])
        );
    });

    test('401 when logged out', async () => {
        expect((await request(app).get('/api/me/summary')).status).toBe(401);
    });
});

describe('decision D2: removing a member with a balance', () => {
    test('admin removing someone who owes -> 409; after settling up -> 204', async () => {
        const ctx = await setup();
        await prdExample(ctx);
        const url = `/api/groups/${ctx.group.id}/members/${id(ctx.meera)}`;

        const blocked = await ctx.aisha.agent.delete(url);
        expect(blocked.status).toBe(409);
        expect(blocked.body.error.code).toBe('BALANCE_NOT_ZERO');

        await settle(ctx.group.id, ctx.meera, ctx.aisha, 17500);
        expect((await ctx.aisha.agent.delete(url)).status).toBe(204);
        expect((await netOf(ctx)).Meera).toBeUndefined();
    });

    test('leaving while you are owed money is blocked too', async () => {
        const ctx = await setup();
        await expense(ctx.rahul, ctx.group.id, 2000, [ctx.aisha, ctx.rahul]);
        const res = await ctx.rahul.agent.delete(`/api/groups/${ctx.group.id}/members/${id(ctx.rahul)}`);
        expect(res.status).toBe(409);
        expect(res.body.error.code).toBe('BALANCE_NOT_ZERO');
    });

    test('a member at 0 can leave even if others still owe', async () => {
        const ctx = await setup();
        await expense(ctx.aisha, ctx.group.id, 2000, [ctx.aisha, ctx.rahul]);
        const res = await ctx.meera.agent.delete(`/api/groups/${ctx.group.id}/members/${id(ctx.meera)}`);
        expect(res.status).toBe(204);
    });
});

describe('decision D4: deleting a group with balances', () => {
    test('409 BALANCE_NOT_ZERO and the group stays', async () => {
        const ctx = await setup();
        await prdExample(ctx);
        const res = await ctx.aisha.agent.delete(`/api/groups/${ctx.group.id}`);

        expect(res.status).toBe(409);
        expect(res.body.error.code).toBe('BALANCE_NOT_ZERO');
        expect((await ctx.aisha.agent.get(`/api/groups/${ctx.group.id}`)).status).toBe(200);
    });

    test('allowed once everything is settled', async () => {
        const ctx = await setup();
        await prdExample(ctx);
        await settle(ctx.group.id, ctx.meera, ctx.aisha, 17500);
        await settle(ctx.group.id, ctx.rahul, ctx.aisha, 2500);

        expect((await ctx.aisha.agent.delete(`/api/groups/${ctx.group.id}`)).status).toBe(204);
        expect((await ctx.aisha.agent.get(`/api/groups/${ctx.group.id}`)).status).toBe(404);
    });

    test('allowed when every expense was paid for yourself', async () => {
        const ctx = await setup();
        await expense(ctx.aisha, ctx.group.id, 5000, [ctx.aisha]);
        expect((await ctx.aisha.agent.delete(`/api/groups/${ctx.group.id}`)).status).toBe(204);
    });
});

describe('consistency across a random ledger', () => {
    test('balances add to 0, match myNetCents, and the suggested payments settle everyone', async () => {
        const ctx = await setup();
        const people = [ctx.aisha, ctx.rahul, ctx.meera];
        let seed = 7;
        const rand = (n) => (seed = (seed * 1103515245 + 12345) % 2147483648) % n;

        for (let i = 0; i < 12; i++) {
            const payer = people[rand(3)];
            const among = people.filter(() => rand(3) > 0);
            await expense(payer, ctx.group.id, 1 + rand(50000), among.length ? among : [payer]);
        }
        await settle(ctx.group.id, ctx.rahul, ctx.meera, 1234);

        const { members } = (await getBalances(ctx.aisha, ctx.group.id)).body;
        expect(sum(members.map((m) => m.netCents))).toBe(0);
        for (const who of people) {
            const listed = members.find((m) => m.user.id === id(who)).netCents;
            const { group } = (await who.agent.get(`/api/groups/${ctx.group.id}`)).body;
            expect(group.myNetCents).toBe(listed);
        }

        const { transfers } = (await getSimplify(ctx.aisha, ctx.group.id)).body;
        expect(transfers.length).toBeLessThanOrEqual(2);
        const byId = Object.fromEntries(people.map((w) => [id(w), w]));
        for (const t of transfers) await settle(ctx.group.id, byId[t.from.id], byId[t.to.id], t.amountCents);
        expect(Object.values(await netOf(ctx))).toEqual([0, 0, 0]);
    });
});
