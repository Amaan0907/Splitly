// Record a payment made outside the app (cash or UPI).
import { useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { Avatar, Button, EASE, ErrorNote, Field, Modal, cx, inputClass } from './ui.jsx'
import { errorText } from '../lib/api.js'
import { MAX_CENTS, centsToInput, currencySymbol, formatMoney, parseAmount } from '../lib/money.js'
import { useCreateSettlement, useSimplify } from '../lib/queries.js'

function Select({ children, ...props }) {
  return (
    <div className="relative min-w-0">
      <select {...props} className={cx(inputClass, 'cursor-pointer appearance-none pr-10')}>
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

function PayVisual({ from, to, me }) {
  const reduce = useReducedMotion()
  const name = (u) => (u ? (u.id === me.id ? 'You' : u.name) : '—')
  return (
    <div aria-hidden="true" className="flex items-start justify-center gap-3 rounded-3xl bg-paper px-4 py-5">
      <div className="flex w-24 flex-col items-center gap-2 text-center">
        <Avatar user={from} size="lg" />
        <span className="w-full truncate text-sm font-semibold">{name(from)}</span>
      </div>
      <svg viewBox="0 0 80 20" className="mt-3.5 h-5 w-20 shrink-0 text-pen">
        <motion.path
          key={`${from?.id}-${to?.id}`}
          d="M3 10h68M63 3l8 7-8 7"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={reduce ? false : { pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.7, ease: EASE, delay: 0.15 }}
        />
      </svg>
      <div className="flex w-24 flex-col items-center gap-2 text-center">
        <Avatar user={to} size="lg" />
        <span className="w-full truncate text-sm font-semibold">{name(to)}</span>
      </div>
    </div>
  )
}

/**
 * prefill: { from?, to?, amountCents? } from a suggested payment.
 * onRecorded(settlement, { fromName, toName }) runs after saving; the page shows the Undo toast.
 */
export default function SettleForm({ group, members, me, prefill = {}, onClose, onRecorded }) {
  const currency = group.currency
  const users = members.map((m) => m.user)
  const byId = Object.fromEntries(users.map((u) => [u.id, u]))
  const firstOther = users.find((u) => u.id !== me.id)?.id ?? me.id

  const [from, setFrom] = useState(prefill.from ?? me.id)
  const [to, setTo] = useState(prefill.to ?? firstOther)
  const [amountText, setAmountText] = useState(prefill.amountCents ? centsToInput(prefill.amountCents) : '')
  const [note, setNote] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [confirmOver, setConfirmOver] = useState(false)

  const create = useCreateSettlement(group.id)
  const simplify = useSimplify(group.id)

  const amountCents = parseAmount(amountText)
  const suggested = simplify.data?.transfers?.find((t) => t.from.id === from && t.to.id === to)?.amountCents
  const over = suggested !== undefined && amountCents !== null && amountCents > suggested

  const errors = {}
  if (from === to) errors.to = 'Pick two different people.'
  if (amountCents === null || amountCents <= 0) errors.amount = 'Enter an amount, like 500 or 99.50.'
  else if (amountCents > MAX_CENTS) errors.amount = `Keep it under ${formatMoney(MAX_CENTS, currency)}.`
  if (note.trim().length > 100) errors.note = 'Keep the note under 100 characters.'

  const label = (u) => (u.id === me.id ? 'You' : u.name)
  const sentenceName = (id) => (id === me.id ? 'you' : byId[id]?.name)

  const onSubmit = (e) => {
    e.preventDefault()
    setSubmitted(true)
    if (Object.keys(errors).length) return
    if (over && !confirmOver) {
      setConfirmOver(true)
      return
    }
    create.mutate(
      { fromUserId: from, toUserId: to, amountCents, note: note.trim() || undefined },
      {
        onSuccess: (settlement) => {
          onClose()
          onRecorded?.(settlement, { fromName: sentenceName(from), toName: sentenceName(to) })
        },
      },
    )
  }

  // Changing anything clears a pending "more than owed" confirmation.
  const change = (setter) => (e) => {
    setConfirmOver(false)
    setter(e.target.value)
  }

  return (
    <Modal
      title="Record payment"
      description="For money paid outside Splitly, by cash or UPI."
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="settle-form" size="lg" busy={create.isPending}>
            {confirmOver ? 'Record anyway' : 'Record payment'}
          </Button>
        </>
      }
    >
      <form id="settle-form" noValidate onSubmit={onSubmit} className="flex flex-col gap-5">
        <PayVisual from={byId[from]} to={byId[to]} me={me} />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Who paid">
            {(p) => (
              <Select {...p} value={from} onChange={change((v) => setFrom(Number(v)))}>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {label(u)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Who received it" error={submitted || from === to ? errors.to : undefined}>
            {(p) => (
              <Select {...p} value={to} onChange={change((v) => setTo(Number(v)))}>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {label(u)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>

        <Field
          label="Amount"
          hint={suggested !== undefined ? `Suggested: ${formatMoney(suggested, currency)}` : undefined}
          error={submitted ? errors.amount : undefined}
        >
          {(p) => (
            <div className="flex items-center gap-2 rounded-2xl bg-paper px-5 py-2 ring-pen/15 transition-shadow focus-within:ring-4">
              <span aria-hidden="true" className="text-3xl font-extrabold text-ink-soft">
                {currencySymbol(currency)}
              </span>
              <input
                {...p}
                inputMode="decimal"
                autoComplete="off"
                placeholder="0"
                value={amountText}
                onChange={change(setAmountText)}
                className="num h-14 w-full min-w-0 border-0 bg-transparent text-4xl font-extrabold tracking-tight outline-none placeholder:text-ink/20 focus-visible:outline-none"
              />
            </div>
          )}
        </Field>

        <Field label="Note (optional)" error={submitted ? errors.note : undefined}>
          {(p) => (
            <input
              {...p}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="for example UPI or cash"
              className={inputClass}
            />
          )}
        </Field>

        <ErrorNote>
          {confirmOver
            ? `That is ${formatMoney(amountCents - suggested, currency)} more than ${sentenceName(from) === 'you' ? 'you owe' : `${sentenceName(from)} owes`} ${sentenceName(to)}. The balance will flip the other way. Record it anyway?`
            : null}
        </ErrorNote>
        <ErrorNote>{create.error ? errorText(create.error) : null}</ErrorNote>
      </form>
    </Modal>
  )
}
