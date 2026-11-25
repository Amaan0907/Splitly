import { AnimatePresence, motion } from 'motion/react'
import { Avatar, Button, Empty, ErrorNote, Money, Skeleton, listItem, useToast } from './ui.jsx'
import { errorText } from '../lib/api.js'
import { formatDateTime } from '../lib/format.js'
import { flatItems, useDeleteSettlement, useSettlements } from '../lib/queries.js'

/** Creator, payer, payee or a group admin can undo a settlement. */
function canUndo(s, me, group) {
  return [s.createdBy?.id, s.from?.id, s.to?.id].includes(me.id) || group.myRole === 'admin'
}

function paidSentence(s, me) {
  if (s.from.id === me.id) return `You paid ${s.to.name}`
  if (s.to.id === me.id) return `${s.from.name} paid you`
  return `${s.from.name} paid ${s.to.name}`
}

function PaymentRow({ s, me, group, index, onUndo, undoing }) {
  const recordedBy = s.createdBy && s.createdBy.id !== s.from.id ? (s.createdBy.id === me.id ? 'you' : s.createdBy.name) : null
  const details = [formatDateTime(s.settledAt), s.note, recordedBy && `Recorded by ${recordedBy}`].filter(Boolean)
  return (
    <motion.li
      layout
      variants={listItem}
      custom={index}
      initial="hidden"
      animate="show"
      exit="exit"
      className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-2xl bg-sheet p-3 ring-1 ring-rule sm:gap-4 sm:p-4"
    >
      <span className="flex -space-x-2" aria-hidden="true">
        <Avatar user={s.from} className="ring-2 ring-sheet" />
        <Avatar user={s.to} className="ring-2 ring-sheet" />
      </span>
      <span className="min-w-0">
        <span className="block truncate font-bold sm:text-lg">{paidSentence(s, me)}</span>
        <span className="block truncate text-sm text-ink-soft">{details.join(' · ')}</span>
      </span>
      <span className="flex flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-3">
        <Money cents={s.amountCents} currency={group.currency} className="font-bold sm:text-lg" />
        {canUndo(s, me, group) && (
          <Button variant="ghost" size="sm" busy={undoing} onClick={() => onUndo(s)} className="-mr-1">
            Undo
          </Button>
        )}
      </span>
    </motion.li>
  )
}

export default function PaymentsTab({ group, me, onGoBalances }) {
  const settlements = useSettlements(group.id)
  const undo = useDeleteSettlement(group.id)
  const toast = useToast()
  const items = flatItems(settlements.data)

  const onUndo = (s) =>
    undo.mutate(s.id, {
      onSuccess: () => toast('Payment undone'),
      onError: (err) => toast(errorText(err)),
    })

  if (settlements.isPending) return <Skeleton rows={3} />

  if (settlements.isError) {
    return (
      <div className="flex flex-col items-start gap-3">
        <ErrorNote className="w-full">{errorText(settlements.error)}</ErrorNote>
        <Button variant="secondary" busy={settlements.isFetching} onClick={() => settlements.refetch()}>
          Try again
        </Button>
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <Empty
        title="No payments yet"
        action={
          <Button variant="secondary" onClick={onGoBalances}>
            See suggested payments
          </Button>
        }
      >
        When someone pays back by cash or UPI, record it from the Balances tab.
      </Empty>
    )
  }

  return (
    <div>
      <ul className="space-y-2.5">
        <AnimatePresence initial={false}>
          {items.map((s, i) => (
            <PaymentRow
              key={s.id}
              s={s}
              me={me}
              group={group}
              index={i}
              onUndo={onUndo}
              undoing={undo.isPending && undo.variables === s.id}
            />
          ))}
        </AnimatePresence>
      </ul>
      {settlements.hasNextPage && (
        <div className="mt-6 flex justify-center">
          <Button
            variant="secondary"
            busy={settlements.isFetchingNextPage}
            onClick={() => settlements.fetchNextPage()}
          >
            Show older payments
          </Button>
        </div>
      )}
    </div>
  )
}
