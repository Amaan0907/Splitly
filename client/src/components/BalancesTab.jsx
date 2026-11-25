import { useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { gsap } from 'gsap'
import { useGSAP } from '@gsap/react'
import { Avatar, Button, EASE, ErrorNote, Money, Skeleton, cx, listItem } from './ui.jsx'
import { errorText } from '../lib/api.js'
import { plural } from '../lib/format.js'
import { useBalances, useSimplify } from '../lib/queries.js'

gsap.registerPlugin(useGSAP)

const ROW_GRID =
  'grid grid-cols-[minmax(0,6.5rem)_minmax(0,1fr)_minmax(0,6rem)] gap-3 sm:grid-cols-[minmax(0,9rem)_minmax(0,1fr)_minmax(0,8.5rem)]'

const nameFor = (u, me) => (u.id === me.id ? 'You' : u.name)

/** "Rahul pays Meera", "You pay Meera", "Rahul pays you" */
function paysSentence(from, to, me) {
  if (from.id === me.id) return `You pay ${to.name}`
  if (to.id === me.id) return `${from.name} pays you`
  return `${from.name} pays ${to.name}`
}

function owesSentence(from, to, me) {
  if (from.id === me.id) return `You owe ${to.name}`
  if (to.id === me.id) return `${from.name} owes you`
  return `${from.name} owes ${to.name}`
}

// ---------- zero-line chart ----------

function BalanceRow({ entry, max, me, currency }) {
  const net = entry.netCents
  const pct = max > 0 ? (Math.abs(net) / max) * 100 : 0
  const spring = { type: 'spring', stiffness: 120, damping: 20 }
  const you = entry.user.id === me.id
  const label = net === 0 ? 'settled up' : net > 0 ? (you ? 'get back' : 'gets back') : you ? 'owe' : 'owes'
  return (
    <li className={cx('balance-row items-center py-1.5', ROW_GRID)}>
      <span className="flex min-w-0 items-center gap-2">
        <Avatar user={entry.user} size="sm" />
        <span className="truncate font-semibold">{nameFor(entry.user, me)}</span>
      </span>
      <span aria-hidden="true" className="grid h-9 grid-cols-2">
        <span className="flex justify-end pr-px">
          <motion.span
            className="h-full rounded-l-lg bg-owe"
            initial={{ width: 0 }}
            animate={{ width: net < 0 ? `${pct}%` : 0 }}
            transition={spring}
          />
        </span>
        <span className="flex pl-px">
          <motion.span
            className="h-full rounded-r-lg bg-owed"
            initial={{ width: 0 }}
            animate={{ width: net > 0 ? `${pct}%` : 0 }}
            transition={spring}
          />
        </span>
      </span>
      <span className="min-w-0 text-right">
        <span className={cx('block text-xs font-semibold', net > 0 ? 'text-owed' : net < 0 ? 'text-owe' : 'text-ink-soft')}>
          {label}
        </span>
        {net !== 0 && (
          <Money
            cents={net}
            currency={currency}
            abs
            className={cx('font-bold', net > 0 ? 'text-owed' : 'text-owe')}
          />
        )}
      </span>
    </li>
  )
}

function ZeroLineChart({ balances, me, currency }) {
  const ref = useRef(null)
  const reduce = useReducedMotion()
  const max = Math.max(0, ...balances.members.map((m) => Math.abs(m.netCents)))

  useGSAP(
    () => {
      if (reduce) return
      gsap
        .timeline()
        .from('.zero-line', { scaleY: 0, transformOrigin: '50% 0%', duration: 0.6, ease: 'power3.out' })
        .from('.balance-row', { x: -16, opacity: 0, duration: 0.5, stagger: 0.07, ease: 'power3.out' }, '-=0.25')
    },
    { scope: ref, dependencies: [reduce] },
  )

  return (
    <div ref={ref} className="relative">
      {/* one continuous zero line, in the middle of the bar column */}
      <div aria-hidden="true" className={cx('pointer-events-none absolute inset-0', ROW_GRID)}>
        <span />
        <span className="flex justify-center">
          <span className="zero-line block h-full w-0.5 rounded-full bg-ink" />
        </span>
        <span />
      </div>
      <ul className="relative">
        {balances.members.map((m) => (
          <BalanceRow key={m.user.id} entry={m} max={max} me={me} currency={currency} />
        ))}
      </ul>
    </div>
  )
}

// ---------- suggestions ----------

function DrawnArrow({ delay = 0, className }) {
  const reduce = useReducedMotion()
  return (
    <svg viewBox="0 0 48 14" className={cx('h-3.5 w-12 shrink-0', className)} aria-hidden="true">
      <motion.path
        d="M2 7h40M36 2l6 5-6 5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={reduce ? false : { pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.7, ease: EASE, delay }}
      />
    </svg>
  )
}

function TransferCard({ transfer, index, me, currency, onRecord }) {
  return (
    <motion.li
      layout
      variants={listItem}
      custom={index}
      initial="hidden"
      animate="show"
      exit="exit"
      className="rounded-3xl bg-sheet p-5 ring-1 ring-rule"
    >
      <div className="flex items-center gap-2 text-ink-soft">
        <Avatar user={transfer.from} />
        <DrawnArrow delay={0.25 + index * 0.08} />
        <Avatar user={transfer.to} />
      </div>
      <p className="mt-3 truncate font-semibold">{paysSentence(transfer.from, transfer.to, me)}</p>
      <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
        <Money
          cents={transfer.amountCents}
          currency={currency}
          className="text-3xl leading-none font-extrabold tracking-tight"
        />
        <Button variant={index === 0 ? 'primary' : 'secondary'} size="sm" onClick={() => onRecord(transfer)}>
          Record payment
        </Button>
      </div>
    </motion.li>
  )
}

const CONFETTI_COLOURS = ['#3343C4', '#0E7A5C', '#B23A3F', '#1C2238', '#F2B544', '#5FD0AE']

/** Peak-end: settling a group ends on a small celebration. */
function AllSquare() {
  const reduce = useReducedMotion()
  return (
    <div className="relative overflow-hidden rounded-3xl bg-owed-tint px-6 py-12 text-center">
      <div className="relative mx-auto size-16">
        {!reduce &&
          Array.from({ length: 14 }, (_, i) => {
            const angle = (i / 14) * Math.PI * 2 + (i % 3) * 0.2
            const dist = 60 + (i % 4) * 16
            return (
              <motion.span
                key={i}
                aria-hidden="true"
                className="absolute top-1/2 left-1/2 h-3 w-1.5 rounded-[2px]"
                style={{ backgroundColor: CONFETTI_COLOURS[i % CONFETTI_COLOURS.length] }}
                initial={{ x: 0, y: 0, opacity: 1, rotate: 0, scale: 0.6 }}
                animate={{
                  x: Math.cos(angle) * dist,
                  y: Math.sin(angle) * dist + 26,
                  opacity: 0,
                  rotate: i % 2 ? 220 : -220,
                  scale: 1,
                }}
                transition={{ duration: 1.2, ease: [0.1, 0.7, 0.3, 1], delay: 0.3 }}
              />
            )
          })}
        <motion.span
          className="relative grid size-16 place-items-center rounded-full bg-owed text-white"
          initial={reduce ? false : { scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 380, damping: 16 }}
        >
          <svg viewBox="0 0 24 24" className="size-8" aria-hidden="true">
            <motion.path
              d="M6 12.5l4 4L18 8.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={reduce ? false : { pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.5, ease: EASE, delay: 0.2 }}
            />
          </svg>
        </motion.span>
      </div>
      <p className="mt-6 text-2xl font-extrabold tracking-tight text-owed">Everyone is square.</p>
      <p className="mt-1 text-ink/70">Nobody owes anything in this group right now.</p>
    </div>
  )
}

// ---------- tab ----------

export default function BalancesTab({ group, me, onSettle }) {
  const balances = useBalances(group.id)
  const simplify = useSimplify(group.id)
  const [showPairwise, setShowPairwise] = useState(false)

  if (balances.isPending || simplify.isPending) {
    return (
      <div className="grid grid-cols-1 gap-10 lg:grid-cols-2">
        <Skeleton rows={4} />
        <Skeleton rows={2} />
      </div>
    )
  }

  const error = balances.error || simplify.error
  if (error) {
    return (
      <div className="flex flex-col items-start gap-3">
        <ErrorNote className="w-full">{errorText(error)}</ErrorNote>
        <Button
          variant="secondary"
          onClick={() => {
            balances.refetch()
            simplify.refetch()
          }}
        >
          Try again
        </Button>
      </div>
    )
  }

  const pairwise = balances.data.pairwise ?? []
  const { transfers = [], pairwiseCount = pairwise.length, simplifiedCount = transfers.length } = simplify.data
  const currency = balances.data.currency ?? group.currency

  return (
    <div className="grid grid-cols-1 gap-12 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:gap-10">
      <section className="min-w-0">
        <h2 className="text-2xl font-extrabold tracking-tight">Where everyone stands</h2>
        <div className="mt-5 rounded-3xl bg-sheet p-4 ring-1 ring-rule sm:p-6">
          <ZeroLineChart balances={balances.data} me={me} currency={currency} />
        </div>

        {pairwise.length > 0 && (
          <div className="mt-4">
            <button
              type="button"
              aria-expanded={showPairwise}
              onClick={() => setShowPairwise((v) => !v)}
              className="text-sm font-semibold text-pen underline decoration-2 underline-offset-4 hover:text-pen-dark"
            >
              {showPairwise ? 'Hide' : 'Show'} who owes whom before simplifying ({pairwise.length})
            </button>
            <AnimatePresence initial={false}>
              {showPairwise && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.35, ease: EASE }}
                  className="overflow-hidden"
                >
                  <ul className="space-y-2 pt-3">
                    {pairwise.map((p) => (
                      <li
                        key={`${p.from.id}-${p.to.id}`}
                        className="flex min-w-0 items-center gap-2 rounded-2xl bg-sheet px-3 py-2 ring-1 ring-rule"
                      >
                        <Avatar user={p.from} size="sm" />
                        <span aria-hidden="true" className="text-ink-soft">
                          →
                        </span>
                        <Avatar user={p.to} size="sm" />
                        <span className="min-w-0 flex-1 truncate text-sm">{owesSentence(p.from, p.to, me)}</span>
                        <Money cents={p.amountCents} currency={currency} className="font-semibold" />
                      </li>
                    ))}
                  </ul>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </section>

      <section className="min-w-0">
        <h2 className="text-2xl font-extrabold tracking-tight">Suggested payments</h2>
        {transfers.length > 0 && (
          <p className="mt-2 text-ink-soft">
            {pairwiseCount > simplifiedCount ? (
              <>
                <span className="font-semibold text-ink">
                  {plural(pairwiseCount, 'debt')} become {plural(simplifiedCount, 'payment')}.
                </span>{' '}
              </>
            ) : null}
            Pay by cash or UPI, then record it here.
          </p>
        )}

        <div className="mt-5">
          {transfers.length === 0 ? (
            <AllSquare />
          ) : (
            <ul className="space-y-3">
              <AnimatePresence initial={false}>
                {transfers.map((t, i) => (
                  <TransferCard
                    key={`${t.from.id}-${t.to.id}`}
                    transfer={t}
                    index={i}
                    me={me}
                    currency={currency}
                    onRecord={(tr) => onSettle({ from: tr.from.id, to: tr.to.id, amountCents: tr.amountCents })}
                  />
                ))}
              </AnimatePresence>
            </ul>
          )}
        </div>

        <Button variant="ghost" className="mt-4" onClick={() => onSettle({})}>
          Record a different payment
        </Button>
      </section>
    </div>
  )
}
