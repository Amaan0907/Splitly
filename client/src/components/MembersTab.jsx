import { useState } from 'react'
import { useNavigate } from 'react-router'
import { AnimatePresence, motion } from 'motion/react'
import { Avatar, Button, ErrorNote, Field, cx, inputClass, listItem, useToast } from './ui.jsx'
import { errorText } from '../lib/api.js'
import { useAddMember, useDeleteGroup, useRemoveMember, useUpdateGroup } from '../lib/queries.js'

/** Two taps instead of "Are you sure?": the first arms the button for a few seconds. */
function useArmed() {
  const [armed, setArmed] = useState(null)
  const arm = (key) => {
    setArmed(key)
    setTimeout(() => setArmed((k) => (k === key ? null : k)), 3500)
  }
  return [armed, arm, () => setArmed(null)]
}

// ---------- member list ----------

function MemberCard({ member, me, isAdmin, index, onRemove, busy, error, armed }) {
  const u = member.user
  const self = u.id === me.id
  const canAct = self || isAdmin
  return (
    <motion.li layout variants={listItem} custom={index} initial="hidden" animate="show" exit="exit">
      <div className="flex min-w-0 items-center gap-3 rounded-2xl bg-sheet p-3 ring-1 ring-rule sm:p-4">
        <Avatar user={u} />
        <div className="min-w-0 flex-1">
          <p className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <span className="truncate font-bold">
              {u.name}
              {self && <span className="font-normal text-ink-soft"> (you)</span>}
            </span>
            {member.role === 'admin' && (
              <span className="rounded-full bg-ink px-2 py-0.5 text-xs font-semibold text-paper">admin</span>
            )}
          </p>
          {u.email && <p className="truncate text-sm text-ink-soft">{u.email}</p>}
        </div>
        {canAct && (
          <Button
            variant={armed ? 'danger' : 'ghost'}
            size="sm"
            busy={busy}
            onClick={() => onRemove(member)}
            className="shrink-0"
          >
            {armed ? (self ? 'Tap again to leave' : 'Tap again') : self ? 'Leave' : 'Remove'}
          </Button>
        )}
      </div>
      <ErrorNote className="mt-2">{error}</ErrorNote>
    </motion.li>
  )
}

// ---------- add someone ----------

function AddSomeone({ group }) {
  const add = useAddMember(group.id)
  const toast = useToast()
  const [email, setEmail] = useState('')
  const [localError, setLocalError] = useState(null)

  const onSubmit = (e) => {
    e.preventDefault()
    const value = email.trim()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      setLocalError('Enter their email, like friend@example.com.')
      return
    }
    setLocalError(null)
    add.mutate(value, {
      onSuccess: (member) => {
        setEmail('')
        toast(`Added ${member?.user?.name ?? value} to ${group.name}`)
      },
    })
  }

  const error = localError || (add.error ? errorText(add.error) : null)

  return (
    <section className="rounded-3xl bg-ink p-6 text-paper sm:p-8">
      <h2 className="text-2xl font-extrabold tracking-tight">Add someone</h2>
      <p className="mt-1 text-paper/70">They need a Splitly account. Use the email they signed up with.</p>
      <form noValidate onSubmit={onSubmit} className="mt-5 flex flex-col gap-3 sm:flex-row">
        <label className="min-w-0 flex-1">
          <span className="sr-only">Their email</span>
          <input
            type="email"
            inputMode="email"
            autoComplete="off"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value)
              setLocalError(null)
              if (add.error) add.reset()
            }}
            placeholder="friend@example.com"
            aria-invalid={error ? true : undefined}
            className="h-12 w-full min-w-0 rounded-full border border-white/20 bg-white/10 px-5 text-paper outline-none transition-[border-color,box-shadow] placeholder:text-paper/45 focus:border-pen-light focus:ring-4 focus:ring-pen-light/25 focus-visible:outline-none"
          />
        </label>
        <Button type="submit" variant="light" busy={add.isPending} className="h-12">
          Add to group
        </Button>
      </form>
      <AnimatePresence initial={false}>
        {error && (
          <motion.p
            role="alert"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mt-3 text-sm font-medium text-owe-light"
          >
            {error}
          </motion.p>
        )}
      </AnimatePresence>
    </section>
  )
}

// ---------- settings ----------

function GroupSettings({ group }) {
  const update = useUpdateGroup(group.id)
  const remove = useDeleteGroup(group.id)
  const toast = useToast()
  const navigate = useNavigate()
  const [name, setName] = useState(group.name)
  const [description, setDescription] = useState(group.description ?? '')
  const [errors, setErrors] = useState({})
  const [armed, arm, disarm] = useArmed()

  const onSave = (e) => {
    e.preventDefault()
    const found = {}
    if (!name.trim()) found.name = 'Give the group a name.'
    else if (name.trim().length > 60) found.name = 'Keep the name under 60 characters.'
    if (description.trim().length > 200) found.description = 'Keep the description under 200 characters.'
    setErrors(found)
    if (Object.keys(found).length) return

    const patch = {}
    if (name.trim() !== group.name) patch.name = name.trim()
    if (description.trim() !== (group.description ?? '')) patch.description = description.trim()
    if (!Object.keys(patch).length) {
      toast('Nothing to save')
      return
    }
    update.mutate(patch, { onSuccess: () => toast('Saved group details') })
  }

  const onDelete = () => {
    if (armed !== 'delete') {
      arm('delete')
      return
    }
    disarm()
    remove.mutate(undefined, {
      onSuccess: () => {
        navigate('/dashboard', { replace: true })
        toast(`Deleted ${group.name}`)
      },
    })
  }

  const error = update.error
    ? errorText(update.error)
    : remove.error
      ? errorText(remove.error, {
          BALANCE_NOT_ZERO: 'Someone in this group still has a balance. Settle up first, then delete it.',
        })
      : null

  return (
    <section className="rounded-3xl bg-sheet p-6 ring-1 ring-rule sm:p-8">
      <h2 className="text-2xl font-extrabold tracking-tight">Group settings</h2>
      <p className="mt-1 text-ink-soft">Only admins can see this. The currency stays {group.currency}.</p>
      <form noValidate onSubmit={onSave} className="mt-5 flex flex-col gap-4">
        <Field label="Name" error={errors.name}>
          {(p) => <input {...p} value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />}
        </Field>
        <Field label="Description" error={errors.description}>
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
        <ErrorNote>{error}</ErrorNote>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
          <Button type="submit" variant="dark" busy={update.isPending}>
            Save details
          </Button>
          <Button variant="danger" busy={remove.isPending} onClick={onDelete}>
            {armed === 'delete' ? 'Tap again to delete' : 'Delete group'}
          </Button>
        </div>
      </form>
    </section>
  )
}

// ---------- tab ----------

export default function MembersTab({ group, members, me }) {
  const removeMember = useRemoveMember(group.id)
  const toast = useToast()
  const navigate = useNavigate()
  const [armed, arm, disarm] = useArmed()
  const [failed, setFailed] = useState(null) // { userId, message }
  const isAdmin = group.myRole === 'admin'

  const onRemove = (member) => {
    const u = member.user
    const self = u.id === me.id
    if (armed !== u.id) {
      setFailed(null)
      arm(u.id)
      return
    }
    disarm()
    removeMember.mutate(u.id, {
      onSuccess: () => {
        if (self) {
          navigate('/dashboard', { replace: true })
          toast(`You left ${group.name}`)
        } else {
          toast(`Removed ${u.name} from ${group.name}`)
        }
      },
      onError: (err) =>
        setFailed({
          userId: u.id,
          message: errorText(err, {
            BALANCE_NOT_ZERO: self
              ? 'You still have a balance in this group. Settle up first, then try again.'
              : `${u.name} still has a balance in this group. Settle up first, then try again.`,
            LAST_ADMIN: 'You are the only admin, so you can’t leave. Delete the group instead once everyone is square.',
          }),
        }),
    })
  }

  return (
    <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      <section className="min-w-0">
        <h2 className="text-2xl font-extrabold tracking-tight">
          Members <span className="text-ink-soft">{members.length}</span>
        </h2>
        <ul className="mt-5 space-y-2.5">
          <AnimatePresence initial={false}>
            {members.map((m, i) => (
              <MemberCard
                key={m.user.id}
                member={m}
                me={me}
                isAdmin={isAdmin}
                index={i}
                onRemove={onRemove}
                armed={armed === m.user.id}
                busy={removeMember.isPending && removeMember.variables === m.user.id}
                error={failed?.userId === m.user.id ? failed.message : null}
              />
            ))}
          </AnimatePresence>
        </ul>
      </section>

      <div className={cx('flex min-w-0 flex-col gap-6')}>
        <AddSomeone group={group} />
        {isAdmin && <GroupSettings key={`${group.name}|${group.description}`} group={group} />}
      </div>
    </div>
  )
}
