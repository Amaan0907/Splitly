# Splitly architecture

How the API is put together, how money is stored and split, and how balances and the "fewest payments" plan are computed. For endpoint details, see [api.md](api.md).

## Request flow

Every request passes through the same layers. Each layer has one job:

```
route ──► requireAuth ──► access check ──► validate ──► controller ──► service ──► repository ──► PostgreSQL
          (JWT cookie)    (member/admin,   (Zod)        (HTTP only)    (rules,     (SQL only)
                           creator/payer)                               transactions,
                                                                        activity log)
```

| Layer | Folder | Responsibility |
|---|---|---|
| Routes | `server/src/routes/` | Map a URL and method to its middleware chain |
| Middleware | `server/src/middleware/` | `auth.js` reads the cookie and loads the user. `requireMember`, `requireExpense` and `requireSettlements` load the resource and check access in the order 404 → 403. `validate.js` runs the Zod schemas. `errorHandler.js` turns every error into the `{ error: { code, message } }` shape. |
| Validators | `server/src/validators/` | Strict Zod schemas for every body and query, so unknown fields are rejected |
| Controllers | `server/src/controllers/` | Read `req.valid`, call a service, send the status code and JSON. No business logic. |
| Services | `server/src/services/` | Business rules (decisions D1–D9). Each change runs in one transaction **together with its activity-log entry**. |
| Repositories | `server/src/repositories/` | Parameterised SQL, and the conversion between snake_case rows and camelCase objects |
| Lib | `server/src/lib/` | Pure functions with no database: `money.js` (splitting), `balances.js` (net, pairwise, simplification), `cursor.js` (pagination), `dates.js` |

Express 5 forwards errors from async handlers automatically, so middleware simply throws `AppError`s (`lib/errors.js`).

## Data model

```
users ──< group_members >── groups
  │                           │
  │                           ├──< expenses ──< expense_splits >── users
  │                           ├──< settlements (from_user → to_user)
  │                           └──< activity_log
```

| Table | Key columns | Notes |
|---|---|---|
| `users` | `id`, `name`, `email` (unique), `password_hash`, `created_at` | bcrypt hash; never returned by the API |
| `groups` | `id`, `name`, `description`, `currency char(3)`, `created_by` | Currency fixed at creation |
| `group_members` | PK `(group_id, user_id)`, `role` (`admin`/`member`), `joined_at` | Cascades when the group is deleted |
| `expenses` | `id`, `group_id`, `amount_cents BIGINT > 0`, `paid_by`, `split_type`, `category`, `expense_date`, `deleted_at` | Soft delete; index on `(group_id, expense_date DESC, id DESC)` for paging |
| `expense_splits` | PK `(expense_id, user_id)`, `share_cents BIGINT ≥ 0`, `raw_value` | `raw_value` is what the user typed (paise, basis points or shares) |
| `settlements` | `id`, `group_id`, `from_user_id`, `to_user_id`, `amount_cents > 0`, `note`, `settled_at` | `CHECK from <> to`; index on `(group_id, settled_at DESC, id DESC)` |
| `activity_log` | `id`, `group_id`, `actor_id`, `action`, `entity_type`, `entity_id`, `payload jsonb` | Append-only history |

Migrations live in `server/migrations/` and are applied with `node-pg-migrate`. `BIGINT` columns are parsed back into JavaScript numbers, which is safe because amounts are capped at ₹1 crore (10⁹ paise).

## Money

- **Integers only.** Every amount is a whole number of paise (`…Cents`). Rupees exist only on screen. This rules out floating-point drift such as `0.1 + 0.2 ≠ 0.3` building up over months of expenses.
- **One splitting function** (`server/src/lib/money.js`, `computeSplit`) turns `(splitType, amountCents, entries)` into `shareCents` for each person. Its guarantee is that **the shares always add up exactly to the total**.

| Split | How each share is computed |
|---|---|
| `equal` | `floor(total / n)` each; the leftover paise go one each to the lowest user ids |
| `exact` | The amounts as given; rejected unless they add up to the total |
| `percent` | Largest remainder on basis points (which must total 10000) |
| `shares` | Largest remainder on the share counts |

**Largest remainder method.** Each person first gets the floor of their exact share. The paise left over (always fewer than the number of people) go one at a time to the people with the largest fractional remainders. Ties go to the lower user id.

Example: ₹100 split three ways by percent (33.34 / 33.33 / 33.33).
1. Each exact share is 3333.33… paise, so everyone gets 3333.
2. That leaves 1 paisa over, which goes to the lowest id.
3. Result: 3334 + 3333 + 3333 = 10000.

The web client (`client/src/lib/money.js`) implements the same rule, so the preview always matches what the server saves.

## Balances

Balances are **never stored**. They are recomputed from the ledger on every request, so they can't drift out of sync with the expenses.

`balancesRepo.ledgerEdges(groupId)` reads the ledger as edges of the form "debtor owes creditor":

- **Expense split:** the participant owes the payer their `share_cents`. The payer's own share is skipped, and deleted expenses are excluded.
- **Settlement from X to Y:** written as "Y owes X". It cancels the debt X paid off. If X paid more than they owed, it creates a debt in the other direction (decision D1).

From those edges, `server/src/lib/balances.js` computes:

| Function | Output |
|---|---|
| `netBalances(edges)` | Each person's net: `+` means owed money, `−` means they owe. **Always sums to 0.** |
| `pairwiseDebts(edges)` | One debt per pair, with A→B and B→A netted. Sorted by amount, then ids. |
| `simplifyDebts(net)` | The greedy settlement plan (below). It throws if the nets don't sum to zero, as a safety net. |
| `suggestTransfers(net, pairwise)` | The simplified plan, or the pairwise list if that happens to be shorter. |

## Debt simplification

**Goal:** find payments that bring everyone to zero, using as few payments as possible.

**Algorithm: greedy min-cash-flow.**
1. Split people into debtors (net < 0) and creditors (net > 0).
2. The largest debtor pays the largest creditor `min(debt, credit)`. Ties go to the lowest user id, so the output is deterministic.
3. At least one of the two is now at zero. Remove them, and repeat until nobody owes anything.

**Properties:**
- **Correct:** each payment moves money from someone who owes to someone who is owed, never past zero. The totals match, so the process ends with everyone at zero.
- **At most *n − 1* payments** for *n* people with a balance, because every step clears at least one person and the last step clears two.
- **Never worse than pairwise:** `suggestTransfers` returns whichever of the two lists is shorter.
- **Runtime** is O(n²) with the linear scans used, which is trivial for groups of a few dozen people.

**Example (the landing page's Goa trip).** Four friends start with 6 pairwise debts. Their nets are:
- Aisha: +₹1,300
- Rahul: −₹300
- Meera: −₹750
- Kabir: −₹250

The greedy plan needs 3 payments: Meera → Aisha ₹750, Rahul → Aisha ₹300, Kabir → Aisha ₹250.

Finding the true minimum number of payments is NP-hard in general (it reduces to subset sum). The greedy plan is the standard practical choice, and the n − 1 bound is what the tests check.

## Pagination

Lists use **keyset (cursor) pagination**, not `OFFSET`:

| List | Sort key | Cursor contents |
|---|---|---|
| Expenses | `(expense_date DESC, id DESC)` | `{ d, i }` |
| Settlements | `(settled_at DESC, id DESC)` | `{ t, i }` |
| Activity | `id DESC` | `{ i }` |

- **Cursors** are base64url JSON (`lib/cursor.js`), checked when decoded. A tampered cursor returns `400`.
- **Fetching:** the repository fetches `limit + 1` rows. The extra row only tells the server whether a next page exists.
- **Timestamp precision:** `settled_at` is truncated to milliseconds on insert, so cursors round-trip exactly through JavaScript `Date`.

## Security

| Concern | Measure |
|---|---|
| Passwords | bcrypt (cost 10). Login compares against a dummy hash when the email is unknown, so response time doesn't reveal whether an account exists. |
| Sessions | JWT in an `HttpOnly` cookie, 7 days. `Secure` and `SameSite=None` in production. |
| Brute force | 10 login/register attempts per 15 minutes per IP, behind `trust proxy = 1` |
| Headers | `helmet` |
| CORS | A single allowed origin (`CLIENT_ORIGIN`) with credentials |
| SQL injection | Parameterised queries only |
| Over-posting | Strict Zod schemas reject unknown fields |
| Data leaks | `passwordHash` is never put on `req.user` or returned. Cookies and auth headers are redacted from logs. |
| Access control | Every group-scoped route checks membership. Edit and undo rights are checked per resource (see [api.md §6](api.md#6-permissions)). |

## Testing

`npm test` at the repository root runs **263 tests** with Jest and Supertest against a real PostgreSQL test database (`TEST_DATABASE_URL`). The database is emptied before each test.

| Suite | Covers |
|---|---|
| `tests/unit/money.test.js` | Every split type, rounding, the leftover-paise rule, bad input |
| `tests/unit/balances.test.js` | Net balances, pairwise netting, simplification correctness, the n − 1 bound, determinism, the zero-sum check. Includes randomised checks over 500–1000 generated ledgers. |
| `tests/integration/auth.test.js` | Register, login, logout, `/me` (including that it never returns the password hash), profile updates |
| `tests/integration/groups.test.js` | Group CRUD, members, permissions, decisions D2, D4, D5, D7, D9 |
| `tests/integration/expenses.test.js` | Expense CRUD, all split types, filters, pagination, soft delete, D3, D8 |
| `tests/integration/balances.test.js` | Balances and simplify after creates, edits, deletes and settlements; the zero-sum invariant |
| `tests/integration/settlements.test.js` | Recording and undoing payments, D1, D6, pagination including payments recorded at the same instant, activity written in the same transaction |
| `tests/integration/activity.test.js` | The activity feed and its pagination |

The tests were checked with **mutation testing**: deliberately breaking the code, such as removing a transaction or an off-by-one in paging, and confirming that a test fails. Where none did, a test was added.

## Web client

`client/` is a separate Vite + React app.

| Concern | Choice |
|---|---|
| Server data | TanStack Query; after every change the group's queries, the group list and the summary are refreshed |
| Routing | React Router: `/`, `/login`, `/register`, `/dashboard`, `/groups/:id?tab=…` |
| Styling | Tailwind CSS 4 with design tokens in `src/index.css` |
| Motion | Motion for UI transitions; GSAP ScrollTrigger and Lenis for the landing page's scroll scenes; everything respects `prefers-reduced-motion` |
| API base | `VITE_API_URL` in production. In development, Vite proxies `/api` to `API_PROXY_TARGET`. |
