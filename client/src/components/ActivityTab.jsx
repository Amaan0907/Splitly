import { AnimatePresence, motion } from 'motion/react'
import { Avatar, Button, Empty, ErrorNote, Skeleton, cx, listItem } from './ui.jsx'
import { errorText } from '../lib/api.js'
import { formatMoney } from '../lib/money.js'
import { formatDateTime } from '../lib/format.js'
import { flatItems, useActivity } from '../lib/queries.js'

// Dot colour: pen for expenses, green for payments, faded for deletions, ink for the rest.
function dotClass(action) {
  if (action.endsWith('.deleted')) return 'bg-rule'
  if (action.startsWith('expense.')) return 'bg-pen'
  if (action.startsWith('settlement.')) return 'bg-owed'
  return 'bg-ink'
}

const quote = (text) => `“${text}”`

/** The sentence after the actor's name, e.g. added “Dinner” (₹3,000). */
function Sentence({ item, me, currency }) {
  const p = item.payload ?? {}
  const money = (c) => (typeof c === 'number' ? formatMoney(c, currency) : null)
  const person = (u, fallback = 'someone') => {
    if (!u) return fallback
    if (typeof u === 'string') return u
    return u.id === me.id ? 'you' : (u.name ?? fallback)
  }
  const struck = (children) => <span className="line-through decoration-ink/40">{children}</span>

  switch (item.action) {
    case 'group.created':
      return <>created the group{p.name ? ` ${quote(p.name)}` : ''}</>
    case 'group.updated':
      return <>updated the group details{p.name ? ` (now ${quote(p.name)})` : ''}</>
    case 'member.added':
      return <>added {person(p.user ?? p.member?.user ?? p.name)}</>
    case 'member.removed': {
      const who = p.user ?? p.member?.user ?? (p.userId ? { id: p.userId, name: p.name } : null)
      if (who && who.id === item.actor?.id) return <>left the group</>
      return <>removed {person(who ?? p.name)}</>
    }
    case 'expense.created':
      return (
        <>
          added {quote(p.description ?? 'an expense')}
          {money(p.amountCents) && ` (${money(p.amountCents)})`}
        </>
      )
    case 'expense.updated': {
      const changed =
        typeof p.previousAmountCents === 'number' && p.previousAmountCents !== p.amountCents
          ? ` (${money(p.previousAmountCents)} to ${money(p.amountCents)})`
          : ''
      return (
        <>
          edited {quote(p.description ?? 'an expense')}
          {changed}
        </>
      )
    }
    case 'expense.deleted':
      return (
        <>
          deleted{' '}
          {struck(
            <>
              {quote(p.description ?? 'an expense')}
              {money(p.amountCents) && ` (${money(p.amountCents)})`}
            </>,
          )}
        </>
      )
    case 'settlement.created':
      return (
        <>
          recorded {money(p.amountCents) ?? 'a payment'} from {person(p.from)} to {person(p.to)}
        </>
      )
    case 'settlement.deleted':
      return (
        <>
          undid {struck(<>a payment of {money(p.amountCents) ?? ''} from {person(p.from)} to {person(p.to)}</>)}
        </>
      )
    default:
      return <>made a change</>
  }
}

export default function ActivityTab({ group, me }) {
  const activity = useActivity(group.id)
  const items = flatItems(activity.data)

  if (activity.isPending) return <Skeleton rows={4} />

  if (activity.isError) {
    return (
      <div className="flex flex-col items-start gap-3">
        <ErrorNote className="w-full">{errorText(activity.error)}</ErrorNote>
        <Button variant="secondary" busy={activity.isFetching} onClick={() => activity.refetch()}>
          Try again
        </Button>
      </div>
    )
  }

  if (items.length === 0) {
    return <Empty title="Nothing has happened yet">Expenses, payments and new members show up here.</Empty>
  }

  return (
    <div>
      <ol className="relative ml-3 space-y-5 border-l-2 border-rule pl-6 sm:ml-4 sm:pl-8">
        <AnimatePresence initial={false}>
          {items.map((item, i) => {
            const actor = item.actor?.id === me.id ? 'You' : (item.actor?.name ?? 'Someone')
            return (
              <motion.li
                key={item.id}
                layout
                variants={listItem}
                custom={i}
                initial="hidden"
                animate="show"
                exit="exit"
                className="relative"
              >
                <span
                  aria-hidden="true"
                  className={cx(
                    'absolute top-3.5 -left-[calc(1.5rem+7px)] size-3 rounded-full ring-4 ring-paper sm:-left-[calc(2rem+7px)]',
                    dotClass(item.action),
                  )}
                />
                <div className="flex min-w-0 items-start gap-3">
                  <Avatar user={item.actor} size="sm" className="mt-0.5" />
                  <div className="min-w-0">
                    <p className={cx('break-words', item.action.endsWith('.deleted') && 'text-ink-soft')}>
                      <span className="font-semibold text-ink">{actor}</span>{' '}
                      <Sentence item={item} me={me} currency={group.currency} />
                    </p>
                    <p className="mt-0.5 text-sm text-ink-soft">
                      <time dateTime={item.createdAt}>{formatDateTime(item.createdAt)}</time>
                    </p>
                  </div>
                </div>
              </motion.li>
            )
          })}
        </AnimatePresence>
      </ol>
      {activity.hasNextPage && (
        <div className="mt-8 flex justify-center">
          <Button variant="secondary" busy={activity.isFetchingNextPage} onClick={() => activity.fetchNextPage()}>
            Show older activity
          </Button>
        </div>
      )}
    </div>
  )
}
