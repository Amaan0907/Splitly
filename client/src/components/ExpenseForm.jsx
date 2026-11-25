// Add / edit expense form, plus a read-only details view for people who can't edit.
import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Avatar, Button, EASE, ErrorNote, Field, Modal, Money, Segmented, cx, inputClass, useToast } from './ui.jsx'
import { errorText } from '../lib/api.js'
import {
  MAX_CENTS,
  centsToInput,
  currencySymbol,
  defaultPercents,
  formatMoney,
  formatPercent,
  parseAmount,
  parsePercent,
  previewSplit,
} from '../lib/money.js'
import { CATEGORIES, categoryLabel, formatDate, todayISO } from '../lib/format.js'
import { useCreateExpense, useDeleteExpense, useUpdateExpense } from '../lib/queries.js'

export const SPLIT_TYPES = [
  { value: 'equal', label: 'Equally' },
  { value: 'exact', label: 'Exact' },
  { value: 'percent', label: 'Percent' },
  { value: 'shares', label: 'Shares' },
]

const splitLabel = (type) => SPLIT_TYPES.find((t) => t.value === type)?.label ?? type

/** Creator, payer or a group admin can change an expense. */
export function canEditExpense(expense, me, group) {
  if (!expense || !me) return false
  return expense.createdBy?.id === me.id || expense.paidBy?.id === me.id || group?.myRole === 'admin'
}

// ---------- helpers ----------

function defaultValues(type, ids) {
  if (type === 'percent') {
    const d = defaultPercents(ids)
    return Object.fromEntries(ids.map((id) => [id, formatPercent(d[id])]))
  }
  if (type === 'shares') return Object.fromEntries(ids.map((id) => [id, '1']))
  return {}
}

function initialValues(expense) {
  if (!expense || expense.splitType === 'equal') return {}
  return Object.fromEntries(
    expense.splits.map((s) => {
      const v = s.value ?? s.shareCents
      if (expense.splitType === 'exact') return [s.user.id, centsToInput(v)]
      if (expense.splitType === 'percent') return [s.user.id, formatPercent(v)]
      return [s.user.id, String(v)]
    }),
  )
}

function parseValue(type, text) {
  const t = String(text ?? '').trim()
  if (type === 'exact') return parseAmount(t)
  if (type === 'percent') return parsePercent(t)
  if (type === 'shares') return /^\d+$/.test(t) ? Number(t) : null
  return null
}

function Select({ children, className, ...props }) {
  return (
    <div className="relative min-w-0">
      <select {...props} className={cx(inputClass, 'cursor-pointer appearance-none pr-10', className)}>
        {children}
      </select>
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="pointer-events-none absolute top-1/2 right-3.5 size-4 -translate-y-1/2 text-ink-soft"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M6 9l6 6 6-6" />
      </svg>
    </div>
  )
}

// ---------- form ----------

export default function ExpenseForm({ group, members, me, expense, onClose }) {
  const editing = Boolean(expense)
  const currency = group.currency
  const memberIds = members.map((m) => m.user.id)
  const nameOf = (u) => (u.id === me.id ? 'You' : u.name)

  const create = useCreateExpense(group.id)
  const update = useUpdateExpense(group.id)
  const remove = useDeleteExpense(group.id)
  const toast = useToast()

  const [amountText, setAmountText] = useState(editing ? centsToInput(expense.amountCents) : '')
  const [description, setDescription] = useState(expense?.description ?? '')
  const [paidBy, setPaidBy] = useState(expense?.paidBy?.id ?? me.id)
  const [expenseDate, setExpenseDate] = useState(expense?.expenseDate ?? todayISO())
  const [category, setCategory] = useState(expense?.category ?? '')
  const [splitType, setSplitType] = useState(expense?.splitType ?? 'equal')
  const [selected, setSelected] = useState(() =>
    editing ? memberIds.filter((id) => expense.splits.some((s) => s.user.id === id)) : memberIds,
  )
  const [values, setValues] = useState(() =>
    editing ? initialValues(expense) : defaultValues(expense?.splitType ?? 'equal', memberIds),
  )
  const [percentTouched, setPercentTouched] = useState(editing)
  const [submitted, setSubmitted] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const amountCents = parseAmount(amountText) ?? 0
  const preview = previewSplit(
    amountCents,
    splitType,
    selected.map((id) => ({
      userId: id,
      value: splitType === 'equal' ? undefined : (parseValue(splitType, values[id]) ?? 0),
    })),
    { currency },
  )

  // ----- errors -----
  const errors = {}
  const parsedAmount = parseAmount(amountText)
  if (parsedAmount === null || parsedAmount <= 0) errors.amount = 'Enter an amount, like 450 or 99.50.'
  else if (parsedAmount > MAX_CENTS) errors.amount = `Keep it under ${formatMoney(MAX_CENTS, currency)}.`
  if (!description.trim()) errors.description = 'Say what it was for.'
  else if (description.trim().length > 100) errors.description = 'Keep it under 100 characters.'
  if (!expenseDate) errors.date = 'Pick a date.'
  else if (expenseDate > todayISO()) errors.date = 'Pick today or an earlier date.'
  const badValue =
    splitType !== 'equal' && selected.some((id) => parseValue(splitType, values[id]) === null)
  if (badValue) {
    errors.splits =
      splitType === 'exact'
        ? 'Enter amounts like 250 or 99.50 for everyone ticked.'
        : splitType === 'percent'
          ? 'Enter percentages like 25 or 33.33 for everyone ticked.'
          : 'Enter a whole number of shares for everyone ticked.'
  } else if (preview.error) {
    errors.splits = preview.error
  }
  const showSplitError = errors.splits && (submitted || amountCents > 0 || selected.length === 0)

  // ----- actions -----
  const setType = (type) => {
    setSplitType(type)
    setPercentTouched(false)
    setValues(defaultValues(type, selected))
  }

  const setSelection = (next) => {
    setSelected(next)
    if (splitType === 'percent' && !percentTouched) setValues(defaultValues('percent', next))
    if (splitType === 'shares') {
      setValues((v) => {
        const out = { ...v }
        for (const id of next) if (!out[id]) out[id] = '1'
        return out
      })
    }
  }

  const toggle = (id) => {
    const set = new Set(selected)
    if (set.has(id)) set.delete(id)
    else set.add(id)
    setSelection(memberIds.filter((m) => set.has(m)))
  }

  const allSelected = selected.length === memberIds.length

  const setValue = (id, text) => {
    if (splitType === 'percent') setPercentTouched(true)
    setValues((v) => ({ ...v, [id]: text }))
  }

  const mutation = editing ? update : create
  const busy = mutation.isPending

  const onSubmit = (e) => {
    e.preventDefault()
    setSubmitted(true)
    if (Object.keys(errors).length) return

    const body = {
      description: description.trim(),
      amountCents: parsedAmount,
      paidBy,
      splitType,
      expenseDate,
      splits: selected.map((id) =>
        splitType === 'equal' ? { userId: id } : { userId: id, value: parseValue(splitType, values[id]) },
      ),
    }
    if (category) body.category = category
    else if (editing && expense.category) body.category = null

    const label = body.description
    if (editing) {
      update.mutate(
        { id: expense.id, ...body },
        {
          onSuccess: () => {
            onClose()
            toast(`Saved changes to “${label}”`)
          },
        },
      )
    } else {
      create.mutate(body, {
        onSuccess: () => {
          onClose()
          toast(`Added “${label}”, ${formatMoney(body.amountCents, currency)}`)
        },
      })
    }
  }

  const onDelete = () => {
    if (!confirmDelete) {
      setConfirmDelete(true)
      setTimeout(() => setConfirmDelete(false), 3500)
      return
    }
    remove.mutate(expense.id, {
      onSuccess: () => {
        onClose()
        toast(`Deleted “${expense.description}”`)
      },
    })
  }

  const serverError = (mutation.error || remove.error) && errorText(mutation.error || remove.error)

  return (
    <Modal
      wide
      title={editing ? 'Edit expense' : 'Add expense'}
      onClose={onClose}
      footer={
        <>
          {editing && (
            <Button variant="danger" className="mr-auto" busy={remove.isPending} onClick={onDelete}>
              {confirmDelete ? 'Tap again to delete' : 'Delete'}
            </Button>
          )}
          <Button type="submit" form="expense-form" size="lg" busy={busy}>
            {editing ? 'Save changes' : 'Add expense'}
          </Button>
        </>
      }
    >
      <form id="expense-form" noValidate onSubmit={onSubmit} className="flex flex-col gap-6">
        {/* The amount is the biggest thing on the form. */}
        <Field label="How much?" error={submitted ? errors.amount : undefined}>
          {(p) => (
            <div className="flex items-center gap-2 rounded-2xl bg-paper px-5 py-3 ring-pen/15 transition-shadow focus-within:ring-4">
              <span aria-hidden="true" className="text-4xl font-extrabold text-ink-soft">
                {currencySymbol(currency)}
              </span>
              <input
                {...p}
                inputMode="decimal"
                autoComplete="off"
                placeholder="0"
                value={amountText}
                onChange={(e) => setAmountText(e.target.value)}
                className="num h-16 w-full min-w-0 border-0 bg-transparent text-5xl font-extrabold tracking-tight outline-none placeholder:text-ink/20 focus-visible:outline-none"
              />
            </div>
          )}
        </Field>

        <Field label="What was it for?" error={submitted ? errors.description : undefined}>
          {(p) => (
            <input
              {...p}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Dinner at Thalassa"
              className={inputClass}
            />
          )}
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Paid by">
            {(p) => (
              <Select {...p} value={paidBy} onChange={(e) => setPaidBy(Number(e.target.value))}>
                {members.map((m) => (
                  <option key={m.user.id} value={m.user.id}>
                    {nameOf(m.user)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Date" error={submitted ? errors.date : undefined}>
            {(p) => (
              <input
                {...p}
                type="date"
                max={todayISO()}
                value={expenseDate}
                onChange={(e) => setExpenseDate(e.target.value)}
                className={inputClass}
              />
            )}
          </Field>
          <Field label="Category">
            {(p) => (
              <Select {...p} value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="">No category</option>
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>

        {/* ----- split ----- */}
        <div role="group" aria-labelledby="split-label" className="min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span id="split-label" className="text-sm font-semibold">
              Split
            </span>
            <button
              type="button"
              onClick={() => setSelection(allSelected ? [] : memberIds)}
              className="text-sm font-semibold text-pen underline decoration-2 underline-offset-4 hover:text-pen-dark"
            >
              {allSelected ? 'Clear everyone' : 'Select everyone'}
            </button>
          </div>
          <Segmented
            label="How to split it"
            tone="light"
            options={SPLIT_TYPES}
            value={splitType}
            onChange={setType}
            className="mt-3"
          />

          <ul className="mt-4 space-y-2">
            {members.map((m) => {
              const u = m.user
              const on = selected.includes(u.id)
              const inputId = `split-${u.id}`
              return (
                <li
                  key={u.id}
                  className={cx(
                    'flex min-w-0 items-center gap-3 rounded-2xl px-3 py-2 transition-colors',
                    on ? 'bg-paper' : 'bg-transparent',
                  )}
                >
                  <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 py-1">
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => toggle(u.id)}
                      className="size-5 shrink-0 cursor-pointer accent-pen"
                    />
                    <Avatar user={u} size="sm" />
                    <span className={cx('truncate font-semibold', !on && 'text-ink-soft')}>{nameOf(u)}</span>
                  </label>

                  <AnimatePresence initial={false}>
                    {on && splitType !== 'equal' && (
                      <motion.div
                        key={splitType}
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.8 }}
                        transition={{ duration: 0.2, ease: EASE }}
                        className="relative w-20 shrink-0 sm:w-24"
                      >
                        <label htmlFor={inputId} className="sr-only">
                          {splitType === 'exact'
                            ? `${nameOf(u)}'s amount`
                            : splitType === 'percent'
                              ? `${nameOf(u)}'s percentage`
                              : `${nameOf(u)}'s shares`}
                        </label>
                        <input
                          id={inputId}
                          inputMode={splitType === 'shares' ? 'numeric' : 'decimal'}
                          autoComplete="off"
                          value={values[u.id] ?? ''}
                          onChange={(e) => setValue(u.id, e.target.value)}
                          placeholder="0"
                          className={cx(
                            inputClass,
                            'num h-10 rounded-lg px-2.5 text-right',
                            splitType === 'percent' && 'pr-6',
                          )}
                        />
                        {splitType === 'percent' && (
                          <span
                            aria-hidden="true"
                            className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-sm text-ink-soft"
                          >
                            %
                          </span>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <span className="w-20 shrink-0 text-right text-sm sm:w-24 sm:text-base">
                    {on ? (
                      <Money cents={preview.shares[u.id] ?? 0} currency={currency} className="font-semibold" />
                    ) : (
                      <span className="text-ink-soft">not in</span>
                    )}
                  </span>
                </li>
              )
            })}
          </ul>

          <p aria-live="polite" className="mt-3 min-h-5 text-sm text-owe">
            {showSplitError ? errors.splits : ''}
          </p>
        </div>

        <ErrorNote>{serverError || null}</ErrorNote>
      </form>
    </Modal>
  )
}

// ---------- read-only details ----------

export function ExpenseDetails({ group, me, expense, onClose }) {
  const nameOf = (u) => (u?.id === me.id ? 'You' : u?.name)
  const meta = [
    ['Paid by', nameOf(expense.paidBy)],
    ['Date', formatDate(expense.expenseDate)],
    ['Category', categoryLabel(expense.category) ?? 'None'],
    ['Split', splitLabel(expense.splitType)],
  ]
  const owner = [expense.createdBy?.name, expense.paidBy?.name].filter(Boolean)
  const who = [...new Set(owner)].join(' or ')

  return (
    <Modal title={expense.description} onClose={onClose}>
      <Money cents={expense.amountCents} currency={group.currency} className="text-5xl font-extrabold tracking-tight" />
      <dl className="mt-6 grid grid-cols-2 gap-x-4 gap-y-3 border-t-2 border-ink pt-4">
        {meta.map(([k, v]) => (
          <div key={k} className="min-w-0">
            <dt className="text-sm text-ink-soft">{k}</dt>
            <dd className="truncate font-semibold">{v}</dd>
          </div>
        ))}
      </dl>
      <h3 className="mt-6 text-sm font-semibold">Shares</h3>
      <ul className="mt-2 space-y-2">
        {expense.splits.map((s) => (
          <li key={s.user.id} className="flex min-w-0 items-center gap-3 rounded-2xl bg-paper px-3 py-2">
            <Avatar user={s.user} size="sm" />
            <span className="min-w-0 flex-1 truncate font-semibold">{nameOf(s.user)}</span>
            <Money cents={s.shareCents} currency={group.currency} className="font-semibold" />
          </li>
        ))}
      </ul>
      <p className="mt-5 text-sm text-ink-soft">
        Only {who || 'the person who added it'} or a group admin can change this expense.
      </p>
    </Modal>
  )
}
