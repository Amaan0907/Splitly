# Splitly API reference

This document describes the Splitly REST API as it is implemented in `server/`. The Zod schemas in `server/src/validators/` and the integration tests in `tests/integration/` are the source of truth. If you change behaviour, update this file in the same commit.

- **Base URL (local):** `http://localhost:4000/api`
- **Base URL (production):** `https://splitly-0qy4.onrender.com/api`

## Contents

1. [Conventions](#1-conventions)
2. [Authentication and sessions](#2-authentication-and-sessions)
3. [Errors](#3-errors)
4. [Resource shapes](#4-resource-shapes)
5. [Endpoints](#5-endpoints)
6. [Permissions](#6-permissions)
7. [Product decisions](#7-product-decisions)
8. [Known quirks](#8-known-quirks)
9. [Not built yet](#9-not-built-yet)

### Endpoint index

| Method | Path | Who can call it |
|---|---|---|
| GET | [`/health`](#get-health) | anyone |
| POST | [`/auth/register`](#post-authregister) | anyone (rate limited) |
| POST | [`/auth/login`](#post-authlogin) | anyone (rate limited) |
| POST | [`/auth/logout`](#post-authlogout) | anyone |
| GET | [`/auth/me`](#get-authme) | user |
| PATCH | [`/auth/me`](#patch-authme) | user |
| GET | [`/groups`](#get-groups) | user |
| POST | [`/groups`](#post-groups) | user |
| GET | [`/groups/:id`](#get-groupsid) | member |
| PATCH | [`/groups/:id`](#patch-groupsid) | admin |
| DELETE | [`/groups/:id`](#delete-groupsid) | admin |
| POST | [`/groups/:id/members`](#post-groupsidmembers) | member |
| DELETE | [`/groups/:id/members/:userId`](#delete-groupsidmembersuserid) | admin, or the member themselves |
| GET | [`/groups/:id/expenses`](#get-groupsidexpenses) | member |
| POST | [`/groups/:id/expenses`](#post-groupsidexpenses) | member |
| GET | [`/expenses/:id`](#get-expensesid) | member |
| PATCH | [`/expenses/:id`](#patch-expensesid) | creator, payer or admin |
| DELETE | [`/expenses/:id`](#delete-expensesid) | creator, payer or admin |
| GET | [`/groups/:id/balances`](#get-groupsidbalances) | member |
| GET | [`/groups/:id/simplify`](#get-groupsidsimplify) | member |
| GET | [`/groups/:id/settlements`](#get-groupsidsettlements) | member |
| POST | [`/groups/:id/settlements`](#post-groupsidsettlements) | member |
| DELETE | [`/settlements/:id`](#delete-settlementsid) | creator, payer, receiver or admin |
| GET | [`/groups/:id/activity`](#get-groupsidactivity) | member |
| GET | [`/me/summary`](#get-mesummary) | user |

The terms in the last column:
- **User:** any logged-in user.
- **Member:** a logged-in member of the group in the path, or of the group the expense or settlement belongs to.
- **Admin:** a member whose role is `admin`.

---

## 1. Conventions

| Topic | Rule |
|---|---|
| Format | JSON in and out, `Content-Type: application/json`. |
| Field names | camelCase in JSON (`amountCents`, `paidBy`). The database uses snake_case; repositories convert. |
| IDs | Positive integers. A non-numeric or zero `:id` in the path returns `400 VALIDATION_ERROR`. |
| Money | **Integer minor units**, always named `…Cents` (paise for INR): `₹100.00` is `10000`. Decimals and strings are rejected. One amount can be at most `1000000000` (₹1 crore). |
| Currency | One currency per group, a 3-letter code (`"INR"`), fixed when the group is created. |
| Dates | Calendar dates are `YYYY-MM-DD` (`expenseDate`). Timestamps are ISO 8601 (`"2026-11-02T14:30:00.000Z"`). |
| Strings | Trimmed by the server. |
| Unknown fields | Rejected with `400 VALIDATION_ERROR` (strict schemas), so typos surface immediately. |
| Pagination | Cursor-based. The request takes `?limit=20&cursor=<opaque>`, where `limit` is 1–100 and defaults to 20. The response is `{ "items": [...], "nextCursor": "<opaque>" \| null }`; `null` means there are no more pages. Treat cursors as opaque strings. |
| Sorting | Newest first, unless an endpoint says otherwise. |
| Empty success | `204 No Content` with no body. |

### Split types

What each participant's `value` means depends on the expense's `splitType`:

| `splitType` | `value` per participant | Rule |
|---|---|---|
| `equal` | omitted | Each participant gets `floor(total / n)`. Leftover paise go one each to participants in ascending user-id order. |
| `exact` | share in paise (integer ≥ 0) | Values must add up to `amountCents`. |
| `percent` | basis points (integer 0–10000; 33.33% is `3333`) | Values must add up to `10000`. |
| `shares` | share count (integer ≥ 1) | Any positive total; amounts are proportional. |

For `percent` and `shares`, each participant gets the floor of their exact share. Leftover paise then go to the largest fractional remainders, with ties going to the lower user id (the largest remainder method). The server always computes and returns the final `shareCents`. The client's preview uses the same rule, so the two agree.

---

## 2. Authentication and sessions

- **The cookie:** register and login set a cookie named `token`, holding a JWT signed with HS256 (`{ sub: "<userId>" }`) that expires after **7 days**.
- **Cookie flags:** always `HttpOnly`, `Path=/`, `Max-Age=604800`.
  - In production they are also `Secure` and `SameSite=None`, because the web client and the API are on different sites.
  - In development the cookie is `SameSite=Lax`.
- **Sending the cookie:** clients must send it with every request: `fetch(url, { credentials: 'include' })`.
- **CORS:** exactly one origin is allowed (`CLIENT_ORIGIN`), with credentials.
- **Expired or bad tokens:** a missing, invalid or expired token on a protected route returns `401 UNAUTHENTICATED`.
- **Rate limit:** `POST /auth/register` and `POST /auth/login` share a limit of **10 requests per 15 minutes per IP**. Further requests get `429 RATE_LIMITED`, with `RateLimit` headers (draft-7) saying when to retry. The API trusts one proxy hop (`trust proxy = 1`), so on Render the limit applies per visitor.

---

## 3. Errors

Every error response has this shape:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request",
    "details": [
      { "path": "amountCents", "message": "Too small: expected number to be >=1" }
    ]
  }
}
```

- `code` is stable and machine-readable. Clients should branch on it.
- `message` is human-readable and safe to show.
- `details` appears only on schema validation errors. `path` is the dotted field path, for example `splits.1.value`.
- Split-rule errors, such as exact amounts that don't add up, come back as `400 VALIDATION_ERROR` with the reason in `message` and no `details`.

### Error codes

| HTTP | `code` | When |
|---|---|---|
| 400 | `VALIDATION_ERROR` | The body, query or path fails validation (including split rules), or the body is not valid JSON |
| 401 | `UNAUTHENTICATED` | No valid session cookie |
| 401 | `INVALID CREDENTIALS` | Wrong email or password on login, or a wrong `currentPassword` (see [known quirks](#8-known-quirks)) |
| 403 | `NOT_A_MEMBER` | The group exists, but the caller is not in it |
| 403 | `FORBIDDEN` | The caller is a member but lacks permission (for example, not an admin) |
| 404 | `NOT_FOUND` | The group, expense, settlement, member or route does not exist. A soft-deleted expense counts as missing. |
| 404 | `USER_NOT_FOUND` | Adding a member by an email that has no account |
| 409 | `EMAIL_TAKEN` | Registering with an email that is already used |
| 409 | `ALREADY_MEMBER` | Adding someone who is already in the group |
| 409 | `BALANCE_NOT_ZERO` | Removing a member, or deleting a group, while a balance is not zero |
| 409 | `LAST_ADMIN` | Removing (or leaving as) the group's only admin |
| 429 | `RATE_LIMITED` | Too many register or login attempts |
| 500 | `INTERNAL_ERROR` | Unexpected server error. Details are logged and never returned. |

For group-scoped routes the checks run in this order:
1. authentication (401);
2. a valid id (400);
3. the group exists (404);
4. membership (403);
5. admin rights where needed (403);
6. body validation (400);
7. business rules (409).

---

## 4. Resource shapes

### User
```json
{ "id": 1, "name": "Aisha", "email": "aisha@example.com", "createdAt": "2026-10-26T09:00:00.000Z" }
```
The password hash is never returned.

### UserRef
A compact user, embedded in other objects.
```json
{ "id": 1, "name": "Aisha" }
```

### Group
```json
{
  "id": 7,
  "name": "Goa Trip",
  "description": "Dec 2026",
  "currency": "INR",
  "createdBy": { "id": 1, "name": "Aisha" },
  "createdAt": "2026-10-26T09:05:00.000Z",
  "memberCount": 4,
  "myRole": "admin",
  "myNetCents": 20000
}
```
`myNetCents` is the caller's balance in this group. A positive value means the caller is owed money; a negative value means they owe.

### Member
```json
{ "user": { "id": 2, "name": "Rahul", "email": "rahul@example.com" }, "role": "member", "joinedAt": "2026-10-26T09:06:00.000Z" }
```
`role` is `admin` or `member`.

### Expense
```json
{
  "id": 42,
  "groupId": 7,
  "description": "Dinner at Thalassa",
  "amountCents": 300000,
  "paidBy": { "id": 1, "name": "Aisha" },
  "splitType": "equal",
  "category": "food",
  "expenseDate": "2026-11-02",
  "splits": [
    { "user": { "id": 1, "name": "Aisha" }, "value": null, "shareCents": 100000 },
    { "user": { "id": 2, "name": "Rahul" }, "value": null, "shareCents": 100000 },
    { "user": { "id": 3, "name": "Meera" }, "value": null, "shareCents": 100000 }
  ],
  "createdBy": { "id": 1, "name": "Aisha" },
  "createdAt": "2026-11-02T18:00:00.000Z",
  "updatedAt": "2026-11-02T18:00:00.000Z"
}
```
- `value` echoes what was entered, according to the [split type](#split-types): `null` for `equal`.
- `category` is one of `food`, `transport`, `stay`, `groceries`, `utilities`, `entertainment`, `shopping`, `other`, or `null`.
- **Invariant:** the `shareCents` values always add up to `amountCents`.

### Settlement
```json
{
  "id": 15,
  "groupId": 7,
  "from": { "id": 3, "name": "Meera" },
  "to": { "id": 1, "name": "Aisha" },
  "amountCents": 175000,
  "note": "UPI",
  "settledAt": "2026-11-05T10:00:00.000Z",
  "createdBy": { "id": 3, "name": "Meera" }
}
```
`from` paid `to` outside the app; Splitly only records it.

### Activity
```json
{
  "id": 301,
  "groupId": 7,
  "actor": { "id": 1, "name": "Aisha" },
  "action": "expense.updated",
  "entityType": "expense",
  "entityId": 42,
  "payload": { "description": "Dinner at Thalassa", "amountCents": 300000, "previousAmountCents": 280000 },
  "createdAt": "2026-11-02T18:10:00.000Z"
}
```

| `action` | `payload` |
|---|---|
| `group.created` | `{ name }` |
| `group.updated` | the fields that were changed |
| `member.added` / `member.removed` | `{ userId, name }` |
| `expense.created` / `expense.deleted` | `{ description, amountCents }` |
| `expense.updated` | `{ description, amountCents, previousAmountCents }` |
| `settlement.created` | `{ from: UserRef, to: UserRef, amountCents }` |
| `settlement.deleted` | `{ settlement: Settlement }`, the full payment that was undone |

### Transfer
Used by the balances and simplify endpoints.
```json
{ "from": { "id": 3, "name": "Meera" }, "to": { "id": 1, "name": "Aisha" }, "amountCents": 175000 }
```

---

## 5. Endpoints

### Health

#### GET /health
Used by Render's health check. It runs `SELECT 1` against the database.

- **200:** `{ "status": "ok", "db": "ok" }`
- **503:** `{ "status": "error", "db": "unreachable" }`

---

### Auth

#### POST /auth/register
Creates an account and logs the user in. **Rate limited.**

```json
{ "name": "Aisha", "email": "aisha@example.com", "password": "correct-horse-battery" }
```

| Field | Rules |
|---|---|
| `name` | 2–50 characters |
| `email` | a valid email, at most 254 characters, stored lowercase |
| `password` | 8–72 characters (bcrypt ignores anything past 72 bytes) |

**201:** sets the `token` cookie and returns `{ "user": User }`.

Errors: `400 VALIDATION_ERROR`, `409 EMAIL_TAKEN`, `429 RATE_LIMITED`.

#### POST /auth/login
**Rate limited.**

```json
{ "email": "aisha@example.com", "password": "correct-horse-battery" }
```

**200:** sets the `token` cookie and returns `{ "user": User }`.

Errors: `400 VALIDATION_ERROR`, `401 INVALID CREDENTIALS` (the same message whether the email or the password is wrong, so the response doesn't reveal which emails have accounts), `429 RATE_LIMITED`.

#### POST /auth/logout
Clears the cookie. It works even without a valid session.

**204**

#### GET /auth/me
Returns the logged-in user. The client calls it on startup to restore the session.

**200:** a `User` object (not wrapped in `{ user }`; see [known quirks](#8-known-quirks)).

Errors: `401 UNAUTHENTICATED`.

#### PATCH /auth/me
Updates the caller's name and/or password. Send only what changes; at least one of `name` or `newPassword` is required.

```json
{ "name": "Aisha K", "currentPassword": "correct-horse-battery", "newPassword": "even-better-passphrase" }
```

| Field | Rules |
|---|---|
| `name` | optional, 2–50 characters |
| `newPassword` | optional, 8–72 characters; requires `currentPassword` |
| `currentPassword` | required when `newPassword` is sent |

**201:** re-issues the `token` cookie and returns `{ "user": User }`. Email changes are not supported.

Errors: `400 VALIDATION_ERROR`, `401 UNAUTHENTICATED`, `401 INVALID CREDENTIALS` (wrong `currentPassword`).

---

### Groups

#### GET /groups
The groups the caller belongs to, each with the caller's balance. Used by the dashboard.

**200:** `{ "items": [Group, ...] }`. This list isn't paginated. Groups with the most recent activity come first.

#### POST /groups
Creates a group. The creator becomes its first member, with role `admin`.

```json
{ "name": "Goa Trip", "description": "Dec 2026", "currency": "INR" }
```

| Field | Rules |
|---|---|
| `name` | 1–60 characters |
| `description` | optional, up to 250 characters |
| `currency` | optional, 3 uppercase letters, default `"INR"` |

**201:** `{ "group": Group }`. Logs `group.created`.

Errors: `400 VALIDATION_ERROR`.

#### GET /groups/:id
**200:** `{ "group": Group, "members": [Member, ...] }`. Members are listed in the order they joined.

Errors: `404 NOT_FOUND`, `403 NOT_A_MEMBER`.

#### PATCH /groups/:id
**Admin only.** Send `name` and/or `description`. The currency cannot be changed; sending `currency` returns `400`.

**200:** `{ "group": Group }`. Logs `group.updated`.

Errors: `400`, `403 NOT_A_MEMBER`, `403 FORBIDDEN`, `404`.

#### DELETE /groups/:id
**Admin only.** Permanently deletes the group and everything in it: expenses, splits, settlements, activity and memberships. It is only allowed when every balance is zero (decision D4).

**204**

Errors: `403 NOT_A_MEMBER`, `403 FORBIDDEN`, `404`, `409 BALANCE_NOT_ZERO`.

---

### Members

#### POST /groups/:id/members
Adds an existing user by email. **Any member** can add people (decision D5). New members join with role `member`.

```json
{ "email": "rahul@example.com" }
```

**201:** `{ "member": Member }`. Logs `member.added`.

Errors: `400`, `403 NOT_A_MEMBER`, `404 NOT_FOUND` (group), `404 USER_NOT_FOUND`, `409 ALREADY_MEMBER`.

#### DELETE /groups/:id/members/:userId
Removes a member. When `:userId` is the caller, this means "leave the group".

These rules are checked in order:
1. Only an admin can remove someone else → otherwise `403 FORBIDDEN`.
2. The person must be a member → otherwise `404 NOT_FOUND`.
3. The only admin cannot be removed or leave → `409 LAST_ADMIN` (decision D7).
4. Their balance in the group must be zero → otherwise `409 BALANCE_NOT_ZERO` (decision D2).

Their past expenses and settlements stay in the ledger, so nobody else's balance changes.

**204.** Logs `member.removed`.

---

### Expenses

#### GET /groups/:id/expenses
A page of the group's expenses. Deleted expenses are excluded. Results are sorted by `expenseDate`, newest first, then by `id`.

| Query | Type | Notes |
|---|---|---|
| `limit`, `cursor` | | see [pagination](#1-conventions) |
| `category` | category | filter |
| `paidBy` | user id | filter |
| `involving` | user id | expenses this user paid for or has a share in |
| `from`, `to` | `YYYY-MM-DD` | inclusive `expenseDate` range |
| `q` | string, 1–100 characters | case-insensitive match on `description` |

**200:** `{ "items": [Expense, ...], "nextCursor": "…" | null }`

Errors: `400`, `403 NOT_A_MEMBER`, `404`.

#### POST /groups/:id/expenses
Creates the expense and its splits in **one transaction**.

```json
{
  "description": "Dinner at Thalassa",
  "amountCents": 300000,
  "paidBy": 1,
  "splitType": "equal",
  "category": "food",
  "expenseDate": "2026-11-02",
  "splits": [{ "userId": 1 }, { "userId": 2 }, { "userId": 3 }]
}
```

| Field | Rules |
|---|---|
| `description` | 1–100 characters |
| `amountCents` | integer, 1 – 1000000000 |
| `paidBy` | a current member (not necessarily the caller) |
| `splitType` | `equal` \| `exact` \| `percent` \| `shares` |
| `category` | optional; one of the categories above, or `null` |
| `expenseDate` | optional `YYYY-MM-DD`, defaults to today (UTC). Future dates are rejected (decision D8). |
| `splits` | 1–50 entries, each `{ userId, value? }`. Every `userId` must be a current member, with no duplicates. The payer doesn't have to be included. |

`splits` for the other split types:
```json
// exact: paise, must add up to amountCents
[{ "userId": 1, "value": 150000 }, { "userId": 2, "value": 100000 }, { "userId": 3, "value": 50000 }]

// percent: basis points, must add up to 10000
[{ "userId": 1, "value": 5000 }, { "userId": 2, "value": 3000 }, { "userId": 3, "value": 2000 }]

// shares: positive counts
[{ "userId": 1, "value": 2 }, { "userId": 2, "value": 1 }, { "userId": 3, "value": 1 }]
```

**201:** `{ "expense": Expense }`, with the computed `shareCents`. Logs `expense.created`.

Errors:
- `400 VALIDATION_ERROR`, for example:
  - the values don't add up;
  - `value` is missing;
  - a `userId` is duplicated;
  - the date is in the future;
  - `paidBy` or a split `userId` is not a member (`details.path` points at that field).
- `403 NOT_A_MEMBER`, `404`.

#### GET /expenses/:id
**200:** `{ "expense": Expense }`

Errors: `403 NOT_A_MEMBER`, `404 NOT_FOUND` (missing or deleted).

#### PATCH /expenses/:id
**Allowed for:** the expense's creator, its payer or a group admin (decision D3).

The body is any subset of the create fields, with one rule: `amountCents`, `splitType` and `splits` must be sent **together or not at all**. When they are sent, every split is recomputed and replaced in one transaction.

```json
{ "description": "Dinner + dessert", "amountCents": 330000, "splitType": "equal", "splits": [{ "userId": 1 }, { "userId": 2 }, { "userId": 3 }] }
```

**200:** `{ "expense": Expense }`. Logs `expense.updated`, including the previous amount.

Errors: `400`, `403 NOT_A_MEMBER`, `403 FORBIDDEN`, `404`.

#### DELETE /expenses/:id
**Allowed for:** the expense's creator, its payer or a group admin.

This is a **soft delete**: it sets `deleted_at`. The expense leaves lists and balances but stays in the activity log.

**204.** Logs `expense.deleted`.

Errors: `403 NOT_A_MEMBER`, `403 FORBIDDEN`, `404` (including an expense that is already deleted).

---

### Balances and simplification

Both endpoints compute from the ledger on every request: every expense split plus every settlement. No balance is ever stored.

#### GET /groups/:id/balances
```json
{
  "currency": "INR",
  "members": [
    { "user": { "id": 1, "name": "Aisha" }, "netCents": 20000 },
    { "user": { "id": 2, "name": "Rahul" }, "netCents": -2500 },
    { "user": { "id": 3, "name": "Meera" }, "netCents": -17500 }
  ],
  "pairwise": [
    { "from": { "id": 2, "name": "Rahul" }, "to": { "id": 1, "name": "Aisha" }, "amountCents": 10000 },
    { "from": { "id": 3, "name": "Meera" }, "to": { "id": 1, "name": "Aisha" }, "amountCents": 10000 },
    { "from": { "id": 3, "name": "Meera" }, "to": { "id": 2, "name": "Rahul" }, "amountCents": 7500 }
  ]
}
```
- **`members`:** every current member (including those at `0`), plus any former member whose balance isn't zero.
  - Sorted by `netCents`, highest first, then by user id.
  - `netCents > 0` means the member is owed money; `< 0` means they owe.
  - **Invariant:** the `netCents` values add up to `0`.
- **`pairwise`:** one entry per pair with a debt (A→B and B→A are already netted against each other). Sorted by amount, largest first.

Errors: `403 NOT_A_MEMBER`, `404`.

#### GET /groups/:id/simplify
The suggested payments that settle the whole group. This is a read-only suggestion: nothing is recorded.

```json
{
  "currency": "INR",
  "transfers": [
    { "from": { "id": 3, "name": "Meera" }, "to": { "id": 1, "name": "Aisha" }, "amountCents": 17500 },
    { "from": { "id": 2, "name": "Rahul" }, "to": { "id": 1, "name": "Aisha" }, "amountCents": 2500 }
  ],
  "pairwiseCount": 3,
  "simplifiedCount": 2
}
```

Guarantees:
- Making every transfer brings every balance to exactly zero.
- Every `amountCents` is greater than 0.
- There are at most *n − 1* transfers for *n* people with a balance, and never more than `pairwiseCount`.
- The same ledger always produces the same output.

An empty `transfers` array means the group is settled. [docs/architecture.md](architecture.md#debt-simplification) explains the algorithm.

Errors: `403 NOT_A_MEMBER`, `404`.

---

### Settlements

#### GET /groups/:id/settlements
Query: `limit`, `cursor`, and an optional `involving` (a user id). Results are sorted by `settledAt`, newest first.

**200:** `{ "items": [Settlement, ...], "nextCursor": "…" | null }`

Errors: `400`, `403 NOT_A_MEMBER`, `404`.

#### POST /groups/:id/settlements
Records a payment made outside the app. Balances change immediately.

```json
{ "fromUserId": 3, "toUserId": 1, "amountCents": 17500, "note": "UPI", "settledAt": "2026-11-05T10:00:00.000Z" }
```

| Field | Rules |
|---|---|
| `fromUserId` | the payer; a current member |
| `toUserId` | the receiver; a current member, different from `fromUserId` |
| `amountCents` | integer, 1 – 1000000000 |
| `note` | optional, up to 100 characters |
| `settledAt` | optional ISO timestamp with `Z` or an offset; defaults to now; cannot be in the future |

- **Any member** can record a payment between any two members (decision D6).
- A payment **may be larger** than what is owed (decision D1); the debt then flips direction. The web client asks for confirmation first.

**201:** `{ "settlement": Settlement }`. Logs `settlement.created`.

Errors: `400 VALIDATION_ERROR` (including the same person on both sides, or a non-member), `403 NOT_A_MEMBER`, `404`.

#### DELETE /settlements/:id
Undoes a payment by deleting the row. The activity log keeps the full payment in its `payload`.

**Allowed for:** whoever recorded it, the payer, the receiver or a group admin.

**204.** Logs `settlement.deleted`.

Errors: `403 NOT_A_MEMBER`, `403 FORBIDDEN`, `404`.

---

### Activity

#### GET /groups/:id/activity
The group's history, newest first. Query: `limit`, `cursor`.

**200:** `{ "items": [Activity, ...], "nextCursor": "…" | null }`

Errors: `400`, `403 NOT_A_MEMBER`, `404`.

---

### Summary

#### GET /me/summary
"You owe" and "you are owed" across all of the caller's groups, for the dashboard. Totals are **per currency**, because rupees and dollars can't be added together.

```json
{
  "totals": [
    { "currency": "INR", "owedToYouCents": 20000, "youOweCents": 4500, "netCents": 15500 }
  ],
  "groups": [
    { "groupId": 7, "name": "Goa Trip", "currency": "INR", "netCents": 20000 },
    { "groupId": 9, "name": "Flat 302", "currency": "INR", "netCents": -4500 }
  ]
}
```
- `owedToYouCents` is the sum of the caller's positive group balances in that currency.
- `youOweCents` is the sum of the negative ones, written as a positive number.
- `groups` lists only groups where the caller's balance isn't zero. If everything is settled, both arrays are empty.

---

## 6. Permissions

| Action | Member | Creator of the item | Payer / receiver | Admin |
|---|:-:|:-:|:-:|:-:|
| View the group, expenses, balances, payments, activity | ✓ | | | ✓ |
| Create a group | any logged-in user | | | |
| Edit or delete the group (balances must be zero) | | | | ✓ |
| Add a member | ✓ | | | ✓ |
| Remove another member | | | | ✓ |
| Leave the group (own balance must be zero, and not the only admin) | ✓ | | | ✓ |
| Create an expense | ✓ | | | ✓ |
| Edit or delete an expense | | ✓ | ✓ (payer) | ✓ |
| Record a payment | ✓ | | | ✓ |
| Undo a payment | | ✓ | ✓ (either) | ✓ |

Someone removed from a group immediately loses access to it (`403 NOT_A_MEMBER`).

---

## 7. Product decisions

Each decision has at least one integration test.

| # | Question | Decision |
|---|---|---|
| D1 | Can a payment be larger than the debt? | **Yes.** The balance flips direction. The client asks for confirmation. |
| D2 | Can a member with a non-zero balance be removed? | **No:** `409 BALANCE_NOT_ZERO`. |
| D3 | Who can edit or delete an expense? | The **creator, the payer or an admin**. |
| D4 | Can a group with open balances be deleted? | **No:** `409 BALANCE_NOT_ZERO`. Otherwise the delete is permanent. |
| D5 | Who can add members? | **Any member.** |
| D6 | Who can record a payment? | **Any member, between any two members.** |
| D7 | Can the only admin leave? | **No:** `409 LAST_ADMIN`. |
| D8 | Are future dates allowed? | **No:** `400` for expenses and payments. |
| D9 | What does a non-member get for a group that exists: 403 or 404? | **403 `NOT_A_MEMBER`.** 404 is only for ids that don't exist. |

---

## 8. Known quirks

These behaviours work, but they don't follow the conventions above. Fixing one means updating the web client and the tests in the same change.

| Behaviour | Expected convention |
|---|---|
| Wrong credentials return code `INVALID CREDENTIALS`, with a space | The other codes use an underscore (`INVALID_CREDENTIALS`) |
| `GET /auth/me` returns the user object directly | Other endpoints wrap it, as in `{ "user": … }` |
| `PATCH /auth/me` returns `201` | `200` is usual for an update |
| Group `description` allows 250 characters | The web client limits the field to 200 |
| Group `name` allows 60 characters | The web client's New group field allows 80, so a 61–80 character name gets a `400` |

---

## 9. Not built yet

These were in the original plan but are **not** implemented. Calling them returns `404 NOT_FOUND`.

- Group analytics (`GET /groups/:id/analytics`) and CSV/PDF export (`GET /groups/:id/export`)
- Notifications (`GET` and `PATCH /notifications`)
- Real-time updates over Socket.IO (the client refreshes its data after every change instead)
- Inviting people who don't have an account yet, and promoting a member to admin
