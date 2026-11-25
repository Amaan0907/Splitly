// Thin fetch wrapper for the Due API.
// Dev: Vite proxies /api to http://localhost:4000. Prod: VITE_API_URL is the API origin.
const BASE = `${(import.meta.env.VITE_API_URL || '').replace(/\/+$/, '')}/api`

export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
  }
}

function buildUrl(path, query) {
  const url = `${BASE}${path}`
  if (!query) return url
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue
    params.set(key, String(value))
  }
  const qs = params.toString()
  return qs ? `${url}?${qs}` : url
}

export async function request(path, { method = 'GET', body, query, signal } = {}) {
  let res
  try {
    res = await fetch(buildUrl(path, query), {
      method,
      credentials: 'include',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    })
  } catch (err) {
    if (err?.name === 'AbortError') throw err
    throw new ApiError(0, 'NETWORK', "Can't reach Splitly. Check your connection and try again.")
  }

  if (res.status === 204) return null

  let data = null
  const text = await res.text()
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = null
    }
  }

  if (!res.ok) {
    const error = data?.error ?? {}
    throw new ApiError(
      res.status,
      error.code ?? `HTTP_${res.status}`,
      error.message ?? 'Something went wrong. Try again.',
      error.details,
    )
  }
  return data
}

export const api = {
  get: (path, opts) => request(path, { ...opts, method: 'GET' }),
  post: (path, body, opts) => request(path, { ...opts, method: 'POST', body: body ?? {} }),
  patch: (path, body, opts) => request(path, { ...opts, method: 'PATCH', body: body ?? {} }),
  del: (path, opts) => request(path, { ...opts, method: 'DELETE' }),
}

// Plain-language messages for the codes the UI cares about. They say how to fix
// the problem and never apologise.
const MESSAGES = {
  NETWORK: "Can't reach Splitly. Check your connection and try again.",
  UNAUTHENTICATED: 'Your session has ended. Log in again.',
  INVALID_CREDENTIALS: "That email and password don't match. Check them and try again.",
  'INVALID CREDENTIALS': "That email and password don't match. Check them and try again.",
  EMAIL_TAKEN: 'An account with this email already exists. Log in instead.',
  RATE_LIMITED: 'Too many attempts. Wait a few minutes, then try again.',
  NOT_A_MEMBER: 'You are not a member of this group. Ask someone in it to add you.',
  FORBIDDEN: "You don't have permission to change this. Ask whoever added it, or a group admin.",
  NOT_FOUND: 'This no longer exists. It may have been deleted.',
  USER_NOT_FOUND: 'Nobody has a Splitly account with that email yet. Ask them to sign up first.',
  ALREADY_MEMBER: 'They are already in this group.',
  BALANCE_NOT_ZERO: 'There is still a balance in this group. Settle up first, then try again.',
  LAST_ADMIN: 'You are the only admin, so you cannot leave. Delete the group instead once everyone is square.',
}

/**
 * Turn any error into one line of text for the UI.
 * `overrides` lets a screen word a code for its context, e.g.
 * errorText(err, { BALANCE_NOT_ZERO: 'Rahul still has a balance…' }).
 */
export function errorText(err, overrides = {}) {
  if (!err) return ''
  if (err instanceof ApiError) {
    if (overrides[err.code]) return overrides[err.code]
    if (err.code === 'VALIDATION_ERROR') return err.details?.[0]?.message ?? err.message
    return MESSAGES[err.code] ?? err.message
  }
  return overrides.default ?? 'Something went wrong. Try again.'
}
