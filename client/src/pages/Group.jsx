import { useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { AnimatePresence, motion } from 'motion/react'
import {
  AvatarStack,
  BackIcon,
  Button,
  EASE,
  Empty,
  ErrorNote,
  Money,
  PlusIcon,
  Segmented,
  buttonClass,
  useToast,
} from '../components/ui.jsx'
import ExpensesTab from '../components/ExpensesTab.jsx'
import ExpenseForm, { ExpenseDetails, canEditExpense } from '../components/ExpenseForm.jsx'
import BalancesTab from '../components/BalancesTab.jsx'
import SettleForm from '../components/SettleForm.jsx'
import PaymentsTab from '../components/PaymentsTab.jsx'
import ActivityTab from '../components/ActivityTab.jsx'
import MembersTab from '../components/MembersTab.jsx'
import { RevealWords } from './landing/fx.jsx'
import { errorText } from '../lib/api.js'
import { formatMoney } from '../lib/money.js'
import { plural } from '../lib/format.js'
import { useDeleteSettlement, useGroup, useMe } from '../lib/queries.js'

const TABS = [
  { value: 'expenses', label: 'Expenses' },
  { value: 'balances', label: 'Balances' },
  { value: 'payments', label: 'Payments' },
  { value: 'activity', label: 'Activity' },
  { value: 'members', label: 'Members' },
]

function GroupHeader({ group, members, onAddExpense, onSettleUp }) {
  const net = group.myNetCents ?? 0
  const users = members.map((m) => m.user)
  const meta = `${plural(members.length, 'member')}, amounts in ${group.currency}`

  return (
    <header className="overflow-hidden rounded-[2rem] bg-ink p-6 text-paper sm:p-10">
      <div className="flex items-center justify-between gap-4">
        <Link to="/dashboard" className={buttonClass('ghost-light', 'sm')}>
          <BackIcon width={16} height={16} /> All groups
        </Link>
        <AvatarStack users={users} max={5} ring="ring-ink" />
      </div>

      <RevealWords
        key={group.id}
        text={group.name}
        className="mt-8 text-[clamp(2.6rem,7vw,5rem)] leading-[0.95] font-extrabold tracking-[-0.035em] break-words"
      />
      <p className="mt-4 text-paper/70 sm:text-lg">
        {group.description ? `${group.description.replace(/\.$/, '')}. ${meta}` : meta}
      </p>

      <div className="mt-8 flex flex-col gap-6 border-t border-white/15 pt-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          {net === 0 ? (
            <p className="text-[clamp(2.2rem,5vw,3.4rem)] leading-none font-extrabold tracking-[-0.03em]">All square</p>
          ) : (
            <>
              <p className="text-sm font-semibold text-paper/70">{net < 0 ? 'You owe' : 'You get back'}</p>
              <Money
                cents={net}
                currency={group.currency}
                abs
                from={0}
                className={
                  'mt-1 block truncate text-[clamp(2.2rem,5vw,3.4rem)] leading-none font-extrabold tracking-[-0.03em] ' +
                  (net < 0 ? 'text-owe-light' : 'text-owed-light')
                }
              />
            </>
          )}
        </div>
        <div className="flex gap-3">
          {/* Hick's law: Settle up is deliberately secondary; Add expense is the one primary action.
              On phones both use the md height so they fit side by side. */}
          <Button variant="ghost-light" size="md" onClick={onSettleUp} className="sm:h-13 sm:px-7 sm:text-lg">
            Settle up
          </Button>
          <Button variant="light" size="md" onClick={onAddExpense} className="sm:h-13 sm:px-7 sm:text-lg">
            <PlusIcon /> Add expense
          </Button>
        </div>
      </div>
    </header>
  )
}

export default function Group() {
  const { id } = useParams()
  const { data: me } = useMe()
  const query = useGroup(id)
  const [params, setParams] = useSearchParams()
  const [form, setForm] = useState(null) // null | { expense?: Expense }
  const [settle, setSettle] = useState(null) // null | { from?, to?, amountCents? }
  const toast = useToast()
  // Lives on the page, not in the modal, so Undo still works after the modal has closed.
  const undoSettlement = useDeleteSettlement(id)

  const onRecorded = (settlement, { fromName, toName }) => {
    const currency = query.data?.group.currency
    toast(`Recorded ${formatMoney(settlement.amountCents, currency)} from ${fromName} to ${toName}`, {
      action: {
        label: 'Undo',
        onClick: () =>
          undoSettlement.mutate(settlement.id, {
            onSuccess: () => toast('Payment undone'),
            onError: (err) => toast(errorText(err)),
          }),
      },
    })
  }

  const requested = params.get('tab')
  const tab = TABS.some((t) => t.value === requested) ? requested : TABS[0].value
  const setTab = (value) => setParams({ tab: value }, { replace: true })

  if (query.isPending) {
    return (
      <div aria-busy="true">
        <div className="h-80 animate-pulse rounded-[2rem] bg-ink/10" />
        <div className="mt-8 h-12 w-72 animate-pulse rounded-full bg-ink/[0.06]" />
      </div>
    )
  }

  if (query.isError) {
    const status = query.error?.status
    if (status === 403 || status === 404) {
      return (
        <Empty
          title={status === 403 ? 'You are not in this group' : 'This group does not exist'}
          action={
            <Link to="/dashboard" className={buttonClass('dark')}>
              Go to your groups
            </Link>
          }
        >
          {status === 403
            ? 'Ask someone in the group to add you with your email.'
            : 'It may have been deleted, or the link is wrong.'}
        </Empty>
      )
    }
    return (
      <div className="flex flex-col items-start gap-3">
        <ErrorNote className="w-full">{errorText(query.error)}</ErrorNote>
        <Button variant="secondary" busy={query.isFetching} onClick={() => query.refetch()}>
          Try again
        </Button>
      </div>
    )
  }

  const { group, members } = query.data
  const openExpense = (expense) => setForm({ expense })

  return (
    <>
      <GroupHeader
        group={group}
        members={members}
        onAddExpense={() => setForm({})}
        onSettleUp={() => setTab('balances')}
      />

      <Segmented
        kind="tabs"
        label="Group sections"
        tone="dark"
        options={TABS}
        value={tab}
        onChange={setTab}
        className="mt-8 w-fit"
      />

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={tab}
          role="tabpanel"
          aria-label={TABS.find((t) => t.value === tab)?.label}
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0, transition: { duration: 0.4, ease: EASE } }}
          exit={{ opacity: 0, y: -8, transition: { duration: 0.18 } }}
          className="mt-6"
        >
          {tab === 'expenses' && (
            <ExpensesTab group={group} me={me} onAdd={() => setForm({})} onOpen={openExpense} />
          )}
          {tab === 'balances' && <BalancesTab group={group} me={me} onSettle={setSettle} />}
          {tab === 'payments' && (
            <PaymentsTab group={group} me={me} onGoBalances={() => setTab('balances')} />
          )}
          {tab === 'activity' && <ActivityTab group={group} me={me} />}
          {tab === 'members' && <MembersTab group={group} members={members} me={me} />}
        </motion.div>
      </AnimatePresence>

      <AnimatePresence>
        {form &&
          (form.expense && !canEditExpense(form.expense, me, group) ? (
            <ExpenseDetails key="details" group={group} me={me} expense={form.expense} onClose={() => setForm(null)} />
          ) : (
            <ExpenseForm
              key={form.expense ? `edit-${form.expense.id}` : 'new'}
              group={group}
              members={members}
              me={me}
              expense={form.expense}
              onClose={() => setForm(null)}
            />
          ))}
      </AnimatePresence>

      <AnimatePresence>
        {settle && (
          <SettleForm
            key="settle"
            group={group}
            members={members}
            me={me}
            prefill={settle}
            onClose={() => setSettle(null)}
            onRecorded={onRecorded}
          />
        )}
      </AnimatePresence>
    </>
  )
}
