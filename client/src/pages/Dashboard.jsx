import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { AnimatePresence, motion } from 'motion/react'
import {
  Button,
  EASE,
  Empty,
  ErrorNote,
  Field,
  Modal,
  Money,
  Net,
  PlusIcon,
  Segmented,
  Skeleton,
  cx,
  inputClass,
  listItem,
  useToast,
} from '../components/ui.jsx'
import { errorText } from '../lib/api.js'
import { CURRENCIES, firstName, plural } from '../lib/format.js'
import { useCreateGroup, useGroups, useMe, useSummary } from '../lib/queries.js'

// Totals per currency worked out from the group list; used if /me/summary is unavailable.
function totalsFromGroups(groups) {
  const map = new Map()
  for (const g of groups) {
    const t = map.get(g.currency) ?? { currency: g.currency, owedToYouCents: 0, youOweCents: 0, netCents: 0 }
    const net = g.myNetCents ?? 0
    if (net > 0) t.owedToYouCents += net
    if (net < 0) t.youOweCents += -net
    t.netCents += net
    map.set(g.currency, t)
  }
  return [...map.values()]
}

// The headline uses INR when present, otherwise the currency with the most at stake.
function pickTotal(totals) {
  if (!totals.length) return null
  const inr = totals.find((t) => t.currency === 'INR')
  if (inr) return inr
  return [...totals].sort((a, b) => b.owedToYouCents + b.youOweCents - (a.owedToYouCents + a.youOweCents))[0]
}

// ---------- headline ----------

const headlineClass =
  'mt-2 max-w-[16ch] text-[clamp(2.4rem,6vw,4.4rem)] leading-[0.95] font-extrabold tracking-[-0.035em]'

function Headline({ total }) {
  const net = total?.netCents ?? 0
  const anyOpen = total && (total.owedToYouCents > 0 || total.youOweCents > 0)

  if (net === 0) {
    return <h1 className={headlineClass}>{anyOpen ? 'Overall, you are even.' : 'You are all settled up.'}</h1>
  }
  const owed = net > 0
  return (
    <h1 className={headlineClass}>
      Overall, {owed ? 'you get back' : 'you owe'}{' '}
      <Money
        cents={net}
        currency={total.currency}
        abs
        from={0}
        duration={1.2}
        className={owed ? 'text-owed' : 'text-owe'}
      />
    </h1>
  )
}

function Tile({ label, cents, currency, tone }) {
  return (
    <div className={cx('min-w-0 rounded-3xl p-6 sm:p-8', tone === 'owed' ? 'bg-owed-tint' : 'bg-owe-tint')}>
      <p className="text-sm font-semibold text-ink/70">{label}</p>
      <Money
        cents={cents}
        currency={currency}
        from={0}
        duration={1.2}
        className={cx(
          'mt-2 block truncate text-[clamp(2rem,5vw,3.2rem)] leading-none font-extrabold tracking-[-0.03em]',
          tone === 'owed' ? 'text-owed' : 'text-owe',
        )}
      />
    </div>
  )
}

// ---------- group rows ----------

/** Zero line in the middle: red grows left, green grows right, scaled to the largest group. */
function MiniBar({ cents, max }) {
  const pct = max > 0 ? (Math.min(Math.abs(cents), max) / max) * 50 : 0
  return (
    <div aria-hidden="true" className="relative h-2.5 w-24 shrink-0 sm:w-36">
      <span className="absolute inset-0 rounded-full bg-ink/[0.06]" />
      <motion.span
        className={cx('absolute inset-y-0 rounded-full', cents < 0 ? 'right-1/2 bg-owe' : 'left-1/2 bg-owed')}
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.9, ease: EASE, delay: 0.25 }}
      />
      <span className="absolute -inset-y-1.5 left-1/2 w-0.5 -translate-x-1/2 rounded-full bg-ink" />
    </div>
  )
}

function GroupRow({ group, max, index }) {
  return (
    <motion.li layout variants={listItem} custom={index} initial="hidden" animate="show" exit="exit">
      <Link
        to={`/groups/${group.id}`}
        className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 rounded-3xl bg-sheet p-5 ring-1 ring-rule transition-[transform,box-shadow] duration-300 hover:-translate-y-0.5 hover:shadow-[0_20px_40px_-28px_rgba(28,34,56,.6)] sm:p-6"
      >
        <div className="min-w-0">
          <p className="truncate text-xl font-extrabold tracking-tight sm:text-2xl">{group.name}</p>
          <p className="mt-0.5 truncate text-sm text-ink-soft">
            {plural(group.memberCount ?? 0, 'member')}, {group.currency}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2.5">
          <MiniBar cents={group.myNetCents ?? 0} max={max} />
          <Net cents={group.myNetCents ?? 0} currency={group.currency} className="text-right text-sm sm:text-base" />
        </div>
      </Link>
    </motion.li>
  )
}

// ---------- new group ----------

function NewGroupModal({ onClose }) {
  const create = useCreateGroup()
  const navigate = useNavigate()
  const toast = useToast()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [currency, setCurrency] = useState('INR')
  const [errors, setErrors] = useState({})

  const onSubmit = (e) => {
    e.preventDefault()
    const found = {}
    const trimmed = name.trim()
    if (!trimmed) found.name = 'Give the group a name.'
    else if (trimmed.length > 60) found.name = 'Keep the name under 60 characters.'
    if (description.trim().length > 200) found.description = 'Keep the description under 200 characters.'
    setErrors(found)
    if (Object.keys(found).length) return

    create.mutate(
      { name: trimmed, description: description.trim() || undefined, currency },
      {
        onSuccess: (group) => {
          onClose()
          navigate(`/groups/${group.id}?tab=members`)
          toast(`${group.name} created. Now add your friends.`)
        },
      },
    )
  }

  return (
    <Modal
      title="New group"
      description="A flat, a trip, a dinner: anything you share costs for."
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="new-group" busy={create.isPending}>
            Create group
          </Button>
        </>
      }
    >
      <form id="new-group" noValidate onSubmit={onSubmit} className="flex flex-col gap-5">
        <Field label="Name" error={errors.name}>
          {(p) => (
            <input
              {...p}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Goa trip, Flat 302…"
              maxLength={60}
              className={cx(inputClass, 'h-16 text-2xl font-bold tracking-tight')}
            />
          )}
        </Field>
        <Field label="Description (optional)" error={errors.description}>
          {(p) => (
            <input
              {...p}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Dec 20–27"
              className={inputClass}
            />
          )}
        </Field>
        <div className="flex min-w-0 flex-col gap-1.5">
          <span id="currency-label" className="text-sm font-semibold">
            Currency
          </span>
          <Segmented
            label="Currency"
            tone="light"
            size="sm"
            options={CURRENCIES.map((c) => ({ value: c, label: c }))}
            value={currency}
            onChange={setCurrency}
          />
          <p className="text-sm text-ink-soft">It can&apos;t be changed later.</p>
        </div>
        <ErrorNote>{create.error ? errorText(create.error) : null}</ErrorNote>
      </form>
    </Modal>
  )
}

// ---------- page ----------

export default function Dashboard() {
  const { data: me } = useMe()
  const groups = useGroups()
  const summary = useSummary()
  const [creating, setCreating] = useState(false)

  const list = groups.data ?? []
  const totals = summary.data?.totals ?? (summary.isError ? totalsFromGroups(list) : [])
  const total = pickTotal(totals)
  const others = totals.filter((t) => t !== total && t.netCents !== 0)
  const open = list.filter((g) => (g.myNetCents ?? 0) !== 0).length
  const max = useMemo(() => Math.max(0, ...list.map((g) => Math.abs(g.myNetCents ?? 0))), [list])

  const loadingTop = summary.isPending && !summary.isError
  const newGroupButton = (
    <Button size="lg" onClick={() => setCreating(true)}>
      <PlusIcon /> New group
    </Button>
  )

  return (
    <>
      <section className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-xl font-semibold text-ink-soft">Hi {firstName(me?.name)},</p>
          {loadingTop ? (
            <div className="mt-3 h-[clamp(5rem,12vw,8.5rem)] max-w-xl animate-pulse rounded-3xl bg-ink/[0.06]" />
          ) : (
            <Headline total={total} />
          )}
        </div>
        <div className="shrink-0">{newGroupButton}</div>
      </section>

      <AnimatePresence>
        {open > 0 && (
          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5, ease: EASE, delay: 0.3 }}
            className="mt-6 inline-flex items-center gap-2 rounded-full bg-sheet px-4 py-2 text-sm ring-1 ring-rule"
          >
            <span className="size-2 rounded-full bg-owe" aria-hidden="true" />
            <span>
              <span className="font-semibold">
                {open === 1 ? '1 group still has an open balance' : `${open} groups still have open balances`}
              </span>
            </span>
          </motion.p>
        )}
      </AnimatePresence>

      <section aria-label="Totals" className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {loadingTop ? (
          <>
            <div className="h-36 animate-pulse rounded-3xl bg-ink/[0.06]" />
            <div className="h-36 animate-pulse rounded-3xl bg-ink/[0.06]" style={{ animationDelay: '120ms' }} />
          </>
        ) : (
          <>
            <Tile label="Owed to you" cents={total?.owedToYouCents ?? 0} currency={total?.currency} tone="owed" />
            <Tile label="You owe" cents={total?.youOweCents ?? 0} currency={total?.currency} tone="owe" />
          </>
        )}
      </section>
      {others.length > 0 && (
        <p className="mt-3 text-sm text-ink-soft">
          In other currencies:{' '}
          {others.map((t, i) => (
            <span key={t.currency}>
              {i > 0 && ', '}
              <Net cents={t.netCents} currency={t.currency} />
            </span>
          ))}
        </p>
      )}

      <section className="mt-14">
        <h2 className="text-2xl font-extrabold tracking-tight">Your groups</h2>
        <div className="mt-5">
          {groups.isPending ? (
            <Skeleton rows={3} />
          ) : groups.isError ? (
            <div className="flex flex-col items-start gap-3">
              <ErrorNote className="w-full">{errorText(groups.error)}</ErrorNote>
              <Button variant="secondary" busy={groups.isFetching} onClick={() => groups.refetch()}>
                Try again
              </Button>
            </div>
          ) : list.length === 0 ? (
            <Empty
              title="No groups yet"
              action={
                <Button onClick={() => setCreating(true)}>
                  <PlusIcon /> Create your first group
                </Button>
              }
            >
              Make one for your flat, a trip or a dinner, then add your friends.
            </Empty>
          ) : (
            <ul className="space-y-3">
              <AnimatePresence initial={false}>
                {list.map((g, i) => (
                  <GroupRow key={g.id} group={g} max={max} index={i} />
                ))}
              </AnimatePresence>
            </ul>
          )}
        </div>
      </section>

      <AnimatePresence>{creating && <NewGroupModal onClose={() => setCreating(false)} />}</AnimatePresence>
    </>
  )
}
