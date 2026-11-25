// Every piece of server data goes through these TanStack Query hooks.
import { useCallback } from 'react'
import {
  MutationCache,
  QueryCache,
  QueryClient,
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { ApiError, api } from './api.js'

export const keys = {
  me: ['me'],
  groups: ['groups'],
  summary: ['summary'],
  group: (id) => ['group', id],
  expenses: (id, filters) => (filters ? ['expenses', id, filters] : ['expenses', id]),
  balances: (id) => ['balances', id],
  simplify: (id) => ['balances', id, 'simplify'], // invalidated together with balances
  settlements: (id) => ['settlements', id],
  activity: (id) => ['activity', id],
}

const GROUP_KEYS = ['group', 'expenses', 'balances', 'settlements', 'activity']

// ---------- client ----------

const isClientError = (err) => err instanceof ApiError && err.status >= 400 && err.status < 500

export function createQueryClient() {
  // Any 401 means the session is gone: forget the user so the route guard sends them to /login.
  const onError = (err) => {
    if (err instanceof ApiError && err.status === 401 && err.code === 'UNAUTHENTICATED') {
      client.setQueryData(keys.me, null)
    }
  }
  const client = new QueryClient({
    queryCache: new QueryCache({ onError }),
    mutationCache: new MutationCache({ onError }),
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: (count, err) => !isClientError(err) && count < 2, // don't retry 4xx
      },
      mutations: { retry: false },
    },
  })
  return client
}

/** Flattens useInfiniteQuery pages into one list. */
export function flatItems(data) {
  return data?.pages.flatMap((p) => p.items) ?? []
}

/** Invalidates everything that one change in a group can affect. */
export function useRefreshGroup(id) {
  const qc = useQueryClient()
  const gid = Number(id)
  return useCallback(
    () =>
      Promise.all([
        ...GROUP_KEYS.map((k) => qc.invalidateQueries({ queryKey: [k, gid] })),
        qc.invalidateQueries({ queryKey: keys.groups }),
        qc.invalidateQueries({ queryKey: keys.summary }),
      ]),
    [qc, gid],
  )
}

// After deleting or leaving a group its queries would only 403/404, so drop them.
function forgetGroup(qc, gid) {
  for (const k of GROUP_KEYS) qc.removeQueries({ queryKey: [k, gid] })
  qc.invalidateQueries({ queryKey: keys.groups })
  qc.invalidateQueries({ queryKey: keys.summary })
}

const stripHash = (u) => {
  if (!u) return null
  const { passwordHash, ...user } = u
  return user
}

// ---------- auth ----------

export function useMe() {
  return useQuery({
    queryKey: keys.me,
    queryFn: async ({ signal }) => {
      try {
        const res = await api.get('/auth/me', { signal })
        return stripHash(res?.user ?? res)
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) return null
        throw err
      }
    },
    staleTime: Infinity,
  })
}

export function useLogin() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body) => api.post('/auth/login', body).then((r) => stripHash(r.user)),
    onSuccess: (user) => qc.setQueryData(keys.me, user),
  })
}

export function useRegister() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body) => api.post('/auth/register', body).then((r) => stripHash(r.user)),
    onSuccess: (user) => qc.setQueryData(keys.me, user),
  })
}

export function useLogout() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api.post('/auth/logout'),
    onSettled: () => {
      qc.clear()
      qc.setQueryData(keys.me, null)
    },
  })
}

// ---------- groups ----------

export function useGroups() {
  return useQuery({
    queryKey: keys.groups,
    queryFn: ({ signal }) => api.get('/groups', { signal }).then((r) => r.items),
  })
}

export function useSummary() {
  return useQuery({
    queryKey: keys.summary,
    queryFn: ({ signal }) => api.get('/me/summary', { signal }),
  })
}

export function useGroup(id) {
  const gid = Number(id)
  return useQuery({
    queryKey: keys.group(gid),
    queryFn: ({ signal }) => api.get(`/groups/${gid}`, { signal }),
    enabled: gid > 0,
  })
}

export function useCreateGroup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body) => api.post('/groups', body).then((r) => r.group),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.groups })
      qc.invalidateQueries({ queryKey: keys.summary })
    },
  })
}

export function useUpdateGroup(id) {
  const gid = Number(id)
  const refresh = useRefreshGroup(gid)
  return useMutation({
    mutationFn: (body) => api.patch(`/groups/${gid}`, body).then((r) => r.group),
    onSuccess: () => {
      refresh()
    },
  })
}

export function useDeleteGroup(id) {
  const qc = useQueryClient()
  const gid = Number(id)
  return useMutation({
    mutationFn: () => api.del(`/groups/${gid}`),
    onSuccess: () => forgetGroup(qc, gid),
  })
}

// ---------- members ----------

export function useAddMember(id) {
  const gid = Number(id)
  const refresh = useRefreshGroup(gid)
  return useMutation({
    mutationFn: (email) => api.post(`/groups/${gid}/members`, { email }).then((r) => r.member),
    onSuccess: () => {
      refresh()
    },
  })
}

/** mutate(userId). Leaving the group yourself drops its cached data. */
export function useRemoveMember(id) {
  const qc = useQueryClient()
  const gid = Number(id)
  const refresh = useRefreshGroup(gid)
  return useMutation({
    mutationFn: (userId) => api.del(`/groups/${gid}/members/${userId}`),
    onSuccess: (_, userId) => {
      const me = qc.getQueryData(keys.me)
      if (me && me.id === userId) forgetGroup(qc, gid)
      else refresh()
    },
  })
}

// ---------- expenses ----------

export function useExpenses(id, { q = '', category = '' } = {}) {
  const gid = Number(id)
  return useInfiniteQuery({
    queryKey: keys.expenses(gid, { q, category }),
    queryFn: ({ pageParam, signal }) =>
      api.get(`/groups/${gid}/expenses`, {
        query: { q, category, cursor: pageParam, limit: 30 },
        signal,
      }),
    initialPageParam: null,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    placeholderData: keepPreviousData, // keep the list while a search refines it
    enabled: gid > 0,
  })
}

export function useCreateExpense(groupId) {
  const refresh = useRefreshGroup(groupId)
  return useMutation({
    mutationFn: (body) => api.post(`/groups/${Number(groupId)}/expenses`, body).then((r) => r.expense),
    onSuccess: () => {
      refresh()
    },
  })
}

/** mutate({ id, ...changes }) */
export function useUpdateExpense(groupId) {
  const refresh = useRefreshGroup(groupId)
  return useMutation({
    mutationFn: ({ id, ...body }) => api.patch(`/expenses/${id}`, body).then((r) => r.expense),
    onSuccess: () => {
      refresh()
    },
  })
}

/** mutate(expenseId) */
export function useDeleteExpense(groupId) {
  const refresh = useRefreshGroup(groupId)
  return useMutation({
    mutationFn: (expenseId) => api.del(`/expenses/${expenseId}`),
    onSuccess: () => {
      refresh()
    },
  })
}

// ---------- balances ----------

export function useBalances(id) {
  const gid = Number(id)
  return useQuery({
    queryKey: keys.balances(gid),
    queryFn: ({ signal }) => api.get(`/groups/${gid}/balances`, { signal }),
    enabled: gid > 0,
  })
}

export function useSimplify(id) {
  const gid = Number(id)
  return useQuery({
    queryKey: keys.simplify(gid),
    queryFn: ({ signal }) => api.get(`/groups/${gid}/simplify`, { signal }),
    enabled: gid > 0,
  })
}

// ---------- settlements ----------

export function useSettlements(id) {
  const gid = Number(id)
  return useInfiniteQuery({
    queryKey: keys.settlements(gid),
    queryFn: ({ pageParam, signal }) =>
      api.get(`/groups/${gid}/settlements`, { query: { cursor: pageParam, limit: 30 }, signal }),
    initialPageParam: null,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: gid > 0,
  })
}

export function useCreateSettlement(groupId) {
  const refresh = useRefreshGroup(groupId)
  return useMutation({
    mutationFn: (body) =>
      api.post(`/groups/${Number(groupId)}/settlements`, body).then((r) => r.settlement),
    onSuccess: () => {
      refresh()
    },
  })
}

/** mutate(settlementId) */
export function useDeleteSettlement(groupId) {
  const refresh = useRefreshGroup(groupId)
  return useMutation({
    mutationFn: (settlementId) => api.del(`/settlements/${settlementId}`),
    onSuccess: () => {
      refresh()
    },
  })
}

// ---------- activity ----------

export function useActivity(id) {
  const gid = Number(id)
  return useInfiniteQuery({
    queryKey: keys.activity(gid),
    queryFn: ({ pageParam, signal }) =>
      api.get(`/groups/${gid}/activity`, { query: { cursor: pageParam, limit: 30 }, signal }),
    initialPageParam: null,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: gid > 0,
  })
}
