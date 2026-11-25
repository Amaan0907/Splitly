import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import {
  Avatar,
  Button,
  Empty,
  ErrorNote,
  Money,
  PlusIcon,
  SearchIcon,
  Segmented,
  Skeleton,
  cx,
  listItem,
} from './ui.jsx'
import { errorText } from '../lib/api.js'
import { CATEGORIES, categoryLabel, dateStamp, monthHeading } from '../lib/format.js'
import { flatItems, useExpenses } from '../lib/queries.js'

const CATEGORY_OPTIONS = [{ value: '', label: 'All' }, ...CATEGORIES]

/** What this expense means for you: lent, borrowed or not involved. */
function Involvement({ expense, me, currency }) {
  const myShare = expense.splits.find((s) => s.user.id === me.id)?.shareCents ?? 0
  const paidByMe = expense.paidBy?.id === me.id

  if (paidByMe) {
    const lent = expense.amountCents - myShare
    if (lent > 0) {
      return (
        <span className="text-owed">
          <span className="block text-xs font-semibold sm:text-sm">you lent</span>
          <Money cents={lent} currency={currency} className="font-bold sm:text-lg" />
        </span>
      )
    }
    return <span className="text-sm text-ink-soft">just for you</span>
  }
  if (myShare > 0) {
    return (
      <span className="text-owe">
        <span className="block text-xs font-semibold sm:text-sm">you borrowed</span>
        <Money cents={myShare} currency={currency} className="font-bold sm:text-lg" />
      </span>
    )
  }
  return <span className="text-sm text-ink-soft">not involved</span>
}

function ExpenseRow({ expense, me, currency, index, onOpen }) {
  const { day, month } = dateStamp(expense.expenseDate)
  const payer = expense.paidBy?.id === me.id ? 'You' : expense.paidBy?.name
  const category = categoryLabel(expense.category)
  return (
    <motion.li layout variants={listItem} custom={index} initial="hidden" animate="show" exit="exit">
      <button
        type="button"
        onClick={() => onOpen(expense)}
        className="grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-2xl bg-sheet p-3 text-left ring-1 ring-rule transition-[transform,box-shadow] duration-300 hover:-translate-y-0.5 hover:shadow-[0_20px_40px_-28px_rgba(28,34,56,.6)] sm:gap-4 sm:p-4"
      >
        <span className="flex w-12 flex-col items-center rounded-xl bg-paper py-1.5 sm:w-14">
          <span className="num text-xl leading-none font-extrabold sm:text-2xl">{day}</span>
          <span className="mt-0.5 text-xs font-semibold text-ink-soft">{month}</span>
        </span>
        <span className="min-w-0">
          <span className="block truncate font-bold sm:text-lg">{expense.description}</span>
          <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-sm text-ink-soft">
            <Avatar user={expense.paidBy} size="sm" className="size-5 text-[10px]" />
            <span className="truncate">
              {payer} paid <Money cents={expense.amountCents} currency={currency} />
              {category && `, ${category.toLowerCase()}`}
            </span>
          </span>
        </span>
        <span className="text-right">
          <Involvement expense={expense} me={me} currency={currency} />
        </span>
      </button>
    </motion.li>
  )
}

export default function ExpensesTab({ group, me, onAdd, onOpen }) {
  const [search, setSearch] = useState('')
  const [q, setQ] = useState('')
  const [category, setCategory] = useState('')

  useEffect(() => {
    const t = setTimeout(() => setQ(search.trim()), 300)
    return () => clearTimeout(t)
  }, [search])

  const expenses = useExpenses(group.id, { q, category })
  const items = flatItems(expenses.data)
  const filtered = Boolean(q || category)

  // Group under month headings, keeping the server's order (newest first).
  const sections = []
  for (const e of items) {
    const heading = monthHeading(e.expenseDate)
    let last = sections[sections.length - 1]
    if (!last || last.heading !== heading) {
      last = { heading, items: [] }
      sections.push(last)
    }
    last.items.push(e)
  }

  let index = 0

  return (
    <div>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <label className="relative block min-w-0 lg:w-72 lg:shrink-0">
          <span className="sr-only">Search expenses</span>
          <SearchIcon className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-ink-soft" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search expenses"
            className="h-12 w-full rounded-full border border-rule bg-sheet pr-4 pl-11 outline-none transition-[border-color,box-shadow] focus:border-pen focus:ring-4 focus:ring-pen/15 focus-visible:outline-none"
          />
        </label>
        <Segmented
          label="Filter by category"
          tone="light"
          size="sm"
          options={CATEGORY_OPTIONS}
          value={category}
          onChange={setCategory}
          className="min-w-0"
        />
      </div>

      <div className={cx('mt-6 transition-opacity', expenses.isPlaceholderData && 'opacity-60')}>
        {expenses.isPending ? (
          <Skeleton rows={4} />
        ) : expenses.isError ? (
          <div className="flex flex-col items-start gap-3">
            <ErrorNote className="w-full">{errorText(expenses.error)}</ErrorNote>
            <Button variant="secondary" busy={expenses.isFetching} onClick={() => expenses.refetch()}>
              Try again
            </Button>
          </div>
        ) : items.length === 0 ? (
          filtered ? (
            <Empty
              title="Nothing matches"
              action={
                <Button
                  variant="secondary"
                  onClick={() => {
                    setSearch('')
                    setQ('')
                    setCategory('')
                  }}
                >
                  Clear filters
                </Button>
              }
            >
              Try another word or category.
            </Empty>
          ) : (
            <Empty
              title="No expenses yet"
              action={
                <Button onClick={onAdd}>
                  <PlusIcon /> Add the first expense
                </Button>
              }
            >
              Add what someone paid, and Splitly works out who owes whom.
            </Empty>
          )
        ) : (
          <div className="space-y-8">
            {sections.map((s) => (
              <section key={s.heading}>
                <h3 className="mb-3 text-lg font-extrabold tracking-tight">{s.heading}</h3>
                <ul className="space-y-2.5">
                  <AnimatePresence initial={false}>
                    {s.items.map((e) => (
                      <ExpenseRow
                        key={e.id}
                        expense={e}
                        me={me}
                        currency={group.currency}
                        index={index++}
                        onOpen={onOpen}
                      />
                    ))}
                  </AnimatePresence>
                </ul>
              </section>
            ))}
            {expenses.hasNextPage && (
              <div className="flex justify-center">
                <Button
                  variant="secondary"
                  busy={expenses.isFetchingNextPage}
                  onClick={() => expenses.fetchNextPage()}
                >
                  Show older expenses
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
