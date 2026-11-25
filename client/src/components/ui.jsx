// Shared UI. Every screen is built from these pieces.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'
import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
} from 'motion/react'
import { formatMoney } from '../lib/money.js'
import { initial } from '../lib/format.js'
import { pauseScroll, resumeScroll } from '../lib/smooth.js'

// ---------- motion constants ----------

export const EASE = [0.2, 0.7, 0.1, 1]
export const SPRING = { type: 'spring', stiffness: 400, damping: 34 }

/** Use for every list, inside <AnimatePresence> with `layout` on the items. */
export const listItem = {
  hidden: { opacity: 0, y: 14 },
  show: (i = 0) => ({
    opacity: 1,
    y: 0,
    x: 0,
    transition: { duration: 0.5, ease: EASE, delay: Math.min(i, 8) * 0.045 },
  }),
  exit: { opacity: 0, x: -12, transition: { duration: 0.25, ease: EASE } },
}

export const cx = (...classes) => classes.filter(Boolean).join(' ')

// ---------- icons ----------

const iconProps = {
  width: 20,
  height: 20,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
}

export const CloseIcon = (p) => (
  <svg {...iconProps} {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
)
export const ArrowIcon = (p) => (
  <svg {...iconProps} {...p}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
)
export const BackIcon = (p) => (
  <svg {...iconProps} {...p}>
    <path d="M19 12H5M11 6l-6 6 6 6" />
  </svg>
)
export const SearchIcon = (p) => (
  <svg {...iconProps} {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="M20 20l-3.5-3.5" />
  </svg>
)
export const PlusIcon = (p) => (
  <svg {...iconProps} {...p}>
    <path d="M12 5v14M5 12h14" />
  </svg>
)

// ---------- Button ----------

const BUTTON_VARIANTS = {
  primary: 'bg-pen text-white shadow-[0_12px_30px_-12px_rgba(51,67,196,.85)] hover:bg-pen-dark',
  dark: 'bg-ink text-paper hover:bg-ink/90',
  light: 'bg-paper text-ink hover:bg-white',
  secondary: 'bg-sheet text-ink ring-1 ring-rule hover:ring-ink/30',
  danger: 'bg-sheet text-owe ring-1 ring-owe/40 hover:bg-owe-tint',
  ghost: 'text-ink hover:bg-ink/[0.06]',
  'ghost-light': 'text-paper ring-1 ring-white/20 hover:bg-white/10',
}

const BUTTON_SIZES = {
  sm: 'h-9 px-4 text-sm',
  md: 'h-11 px-5',
  lg: 'h-13 px-7 text-lg',
}

/** Button look for a <Link> or <a>. */
export function buttonClass(variant = 'primary', size = 'md', className) {
  return cx(
    'relative inline-flex shrink-0 select-none items-center justify-center gap-2 rounded-full font-semibold whitespace-nowrap transition-colors',
    BUTTON_VARIANTS[variant],
    BUTTON_SIZES[size],
    className,
  )
}

function Dots() {
  return (
    <span className="flex gap-1" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="size-1.5 animate-pulse rounded-full bg-current"
          style={{ animationDelay: `${i * 160}ms` }}
        />
      ))}
    </span>
  )
}

export function Button({
  variant = 'primary',
  size = 'md',
  busy = false,
  disabled = false,
  type = 'button',
  className,
  children,
  ...props
}) {
  const inactive = disabled || busy
  return (
    <motion.button
      type={type}
      whileTap={inactive ? undefined : { scale: 0.97 }}
      disabled={inactive}
      aria-busy={busy || undefined}
      className={buttonClass(
        variant,
        size,
        cx(inactive && 'cursor-not-allowed', disabled && !busy && 'opacity-50', className),
      )}
      {...props}
    >
      <span className={cx('inline-flex items-center gap-2', busy && 'invisible')}>{children}</span>
      {busy && (
        <span className="absolute inset-0 grid place-items-center">
          <Dots />
        </span>
      )}
    </motion.button>
  )
}

// ---------- form fields ----------

export const inputClass =
  'h-12 w-full min-w-0 rounded-xl border border-rule bg-sheet px-4 text-base text-ink placeholder:text-ink-soft/60 outline-none transition-[border-color,box-shadow] focus:border-pen focus:ring-4 focus:ring-pen/15 focus-visible:outline-none aria-[invalid=true]:border-owe disabled:opacity-60'

/**
 * <Field label="Email" hint="…" error={err}>
 *   {(p) => <input {...p} className={inputClass} />}
 * </Field>
 * The child receives { id, aria-describedby, aria-invalid }.
 */
export function Field({ label, hint, error, children, className }) {
  const id = useId()
  const noteId = `${id}-note`
  const note = error || hint
  return (
    <div className={cx('flex min-w-0 flex-col gap-1.5', className)}>
      {label && (
        <label htmlFor={id} className="text-sm font-semibold">
          {label}
        </label>
      )}
      {children({
        id,
        'aria-describedby': note ? noteId : undefined,
        'aria-invalid': error ? true : undefined,
      })}
      <AnimatePresence initial={false} mode="wait">
        {note && (
          <motion.p
            key={error ? `e:${error}` : 'hint'}
            id={noteId}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: EASE }}
            className={cx('text-sm', error ? 'text-owe' : 'text-ink-soft')}
          >
            {note}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  )
}

export function ErrorNote({ children, className }) {
  return (
    <AnimatePresence initial={false}>
      {children && (
        <motion.div
          key="error"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.3, ease: EASE }}
          className={cx('overflow-hidden', className)}
        >
          <div role="alert" className="rounded-xl bg-owe-tint px-4 py-3 text-sm font-medium text-owe">
            {children}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// ---------- money ----------

/**
 * An amount that animates from its old value to its new one.
 * `from={0}` counts up on first render.
 */
export function Money({ cents, currency = 'INR', from, abs = false, duration = 0.9, className }) {
  const reduce = useReducedMotion()
  const target = Math.round(Number(cents) || 0)
  const value = useMotionValue(reduce ? target : (from ?? target))
  const [shown, setShown] = useState(value.get())

  useMotionValueEvent(value, 'change', setShown)

  useEffect(() => {
    if (reduce) {
      value.set(target)
      return undefined
    }
    const controls = animate(value, target, { duration, ease: EASE })
    return () => controls.stop()
  }, [target, reduce, duration, value])

  // Keep the decimals steady while the number rolls.
  const fraction = target % 100 === 0 ? 0 : 2
  const finalText = formatMoney(target, currency, { abs })
  return (
    <span className={cx('num', className)}>
      <span aria-hidden="true">{formatMoney(Math.round(shown), currency, { abs, fraction })}</span>
      <span className="sr-only">{finalText}</span>
    </span>
  )
}

/**
 * A balance in words plus colour, never colour alone.
 * you: "you are owed ₹X" / "you owe ₹X"; others: "gets back ₹X" / "owes ₹X"; zero: "settled up".
 */
export function Net({ cents, currency = 'INR', you = true, light = false, from, className }) {
  const value = Math.round(Number(cents) || 0)
  if (value === 0) {
    return <span className={cx(light ? 'text-paper/60' : 'text-ink-soft', className)}>settled up</span>
  }
  const owed = value > 0
  const words = you ? (owed ? 'you are owed' : 'you owe') : owed ? 'gets back' : 'owes'
  const colour = owed ? (light ? 'text-owed-light' : 'text-owed') : light ? 'text-owe-light' : 'text-owe'
  return (
    <span className={cx(colour, className)}>
      {words} <Money cents={value} currency={currency} abs from={from} className="font-semibold" />
    </span>
  )
}

// ---------- avatars ----------

const AVATAR_COLORS = ['#1C2238', '#3343C4', '#5B4A99', '#8A5A2B', '#2F6F7E', '#7A3E5D']

/** The same person has the same colour on every screen. */
export const avatarColor = (userId) => AVATAR_COLORS[Math.abs(Number(userId) || 0) % 6]

const AVATAR_SIZES = {
  sm: 'size-7 text-xs',
  md: 'size-10 text-sm',
  lg: 'size-12 text-base',
}

export function Avatar({ user, size = 'md', className }) {
  return (
    <span
      aria-hidden="true"
      title={user?.name}
      className={cx(
        'inline-grid shrink-0 select-none place-items-center rounded-full font-bold text-white',
        AVATAR_SIZES[size],
        className,
      )}
      style={{ backgroundColor: avatarColor(user?.id) }}
    >
      {initial(user?.name)}
    </span>
  )
}

export function AvatarStack({ users = [], max = 4, size = 'sm', ring = 'ring-sheet', className }) {
  const shown = users.slice(0, max)
  const rest = users.length - shown.length
  return (
    <div
      role="img"
      aria-label={users.map((u) => u.name).join(', ')}
      className={cx('flex -space-x-2', className)}
    >
      {shown.map((u) => (
        <Avatar key={u.id} user={u} size={size} className={cx('ring-2', ring)} />
      ))}
      {rest > 0 && (
        <span
          aria-hidden="true"
          className={cx(
            'inline-grid shrink-0 place-items-center rounded-full bg-paper font-semibold text-ink ring-2',
            ring,
            AVATAR_SIZES[size],
          )}
        >
          +{rest}
        </span>
      )}
    </div>
  )
}

// ---------- loading & empty ----------

/** Skeleton rows. Never a spinner, never "Loading…". */
export function Skeleton({ rows = 3, className }) {
  return (
    <div role="status" aria-busy="true" className={cx('space-y-3', className)}>
      <span className="sr-only">Loading</span>
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          aria-hidden="true"
          className="h-[4.5rem] animate-pulse rounded-2xl bg-ink/[0.06]"
          style={{ animationDelay: `${i * 120}ms` }}
        />
      ))}
    </div>
  )
}

export function Empty({ title, children, action, className }) {
  return (
    <div className={cx('rounded-3xl border-2 border-dashed border-rule px-6 py-12 text-center', className)}>
      <p className="text-xl font-extrabold tracking-tight">{title}</p>
      {children && <p className="mx-auto mt-2 max-w-sm text-ink-soft">{children}</p>}
      {action && <div className="mt-6 flex justify-center">{action}</div>}
    </div>
  )
}

// ---------- Segmented ----------

/**
 * Pill options in a rounded track; the active pill slides between them.
 * kind="tabs" renders role="tablist"/"tab", otherwise "radiogroup"/"radio".
 * Arrow keys, Home and End move the selection.
 */
export function Segmented({
  options,
  value,
  onChange,
  tone = 'dark',
  kind = 'radio',
  label,
  size = 'md',
  className,
}) {
  const pillId = useId()
  const refs = useRef([])
  const trackRef = useRef(null)
  const index = options.findIndex((o) => o.value === value)
  const isTabs = kind === 'tabs'

  // On phones the track scrolls sideways: keep the active option fully visible.
  useEffect(() => {
    const track = trackRef.current
    const btn = refs.current[index]
    if (!track || !btn || track.scrollWidth <= track.clientWidth) return
    const left = btn.offsetLeft - 8
    const right = btn.offsetLeft + btn.offsetWidth + 8
    if (left < track.scrollLeft) track.scrollLeft = left
    else if (right > track.scrollLeft + track.clientWidth) track.scrollLeft = right - track.clientWidth
  }, [index])

  const move = (next) => {
    const i = (next + options.length) % options.length
    onChange(options[i].value)
    refs.current[i]?.focus()
  }

  const onKeyDown = (e) => {
    const current = Math.max(index, 0)
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') move(current + 1)
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') move(current - 1)
    else if (e.key === 'Home') move(0)
    else if (e.key === 'End') move(options.length - 1)
    else return
    e.preventDefault()
  }

  const track = tone === 'dark' ? 'bg-sheet ring-1 ring-rule' : 'bg-ink/[0.05]'
  const pill = tone === 'dark' ? 'bg-ink' : 'bg-sheet ring-1 ring-rule shadow-sm'
  const activeText = tone === 'dark' ? 'text-paper' : 'text-ink'

  return (
    <div
      ref={trackRef}
      role={isTabs ? 'tablist' : 'radiogroup'}
      aria-label={label}
      onKeyDown={onKeyDown}
      className={cx(
        'relative flex max-w-full gap-0.5 overflow-x-auto rounded-full p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        track,
        className,
      )}
    >
      {options.map((o, i) => {
        const active = o.value === value
        return (
          <button
            key={String(o.value)}
            ref={(el) => {
              refs.current[i] = el
            }}
            type="button"
            role={isTabs ? 'tab' : 'radio'}
            aria-selected={isTabs ? active : undefined}
            aria-checked={isTabs ? undefined : active}
            tabIndex={active || (index === -1 && i === 0) ? 0 : -1}
            onClick={() => onChange(o.value)}
            className={cx(
              'relative shrink-0 rounded-full font-semibold whitespace-nowrap transition-colors',
              size === 'sm' ? 'h-8 px-3.5 text-sm' : 'h-10 px-4 text-sm sm:text-base',
              active ? activeText : 'text-ink-soft hover:text-ink',
            )}
          >
            {active && (
              <motion.span
                layoutId={pillId}
                transition={SPRING}
                className={cx('absolute inset-0 rounded-full', pill)}
                aria-hidden="true"
              />
            )}
            <span className="relative">{o.label}</span>
          </button>
        )
      })}
    </div>
  )
}

// ---------- Modal ----------

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

const modalStack = []

/**
 * Bottom sheet on phones, centred card from `sm` up.
 * Wrap in <AnimatePresence> at the call site to get the exit animation.
 */
export function Modal({ title, description, onClose, children, footer, wide = false }) {
  const titleId = useId()
  const panelRef = useRef(null)
  const token = useMemo(() => ({}), [])
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    const previous = document.activeElement
    modalStack.push(token)
    if (modalStack.length === 1) {
      pauseScroll()
      document.body.style.overflow = 'hidden'
    }

    const panel = panelRef.current
    const first =
      panel?.querySelector('input:not([type="checkbox"]):not([disabled]), select, textarea') ??
      panel?.querySelector(FOCUSABLE)
    ;(first ?? panel)?.focus({ preventScroll: true })

    const onKeyDown = (e) => {
      if (modalStack[modalStack.length - 1] !== token) return
      if (e.key === 'Escape') {
        e.preventDefault()
        onCloseRef.current?.()
        return
      }
      if (e.key !== 'Tab' || !panel) return
      const items = [...panel.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null)
      if (items.length === 0) {
        e.preventDefault()
        return
      }
      const firstEl = items[0]
      const lastEl = items[items.length - 1]
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault()
        lastEl.focus()
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault()
        firstEl.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)

    return () => {
      document.removeEventListener('keydown', onKeyDown)
      modalStack.splice(modalStack.indexOf(token), 1)
      if (modalStack.length === 0) {
        document.body.style.overflow = ''
        resumeScroll()
      }
      if (previous instanceof HTMLElement) previous.focus({ preventScroll: true })
    }
  }, [token])

  return createPortal(
    <div
      data-lenis-prevent
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6"
    >
      <motion.div
        aria-hidden="true"
        onClick={() => onCloseRef.current?.()}
        className="absolute inset-0 bg-ink/55 backdrop-blur-[3px]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.25 }}
      />
      <motion.div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        initial={{ opacity: 0, y: 60, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 60, scale: 0.98, transition: { duration: 0.2, ease: EASE } }}
        transition={{ type: 'spring', stiffness: 360, damping: 34 }}
        className={cx(
          'relative flex max-h-[92svh] w-full flex-col rounded-t-3xl bg-sheet outline-none sm:rounded-3xl',
          wide ? 'sm:max-w-2xl' : 'sm:max-w-md',
        )}
      >
        <div className="mx-auto mt-3 h-1.5 w-10 shrink-0 rounded-full bg-rule sm:hidden" aria-hidden="true" />
        <div className="flex shrink-0 items-start justify-between gap-4 px-6 pt-4 pb-2 sm:pt-6">
          <div className="min-w-0">
            <h2 id={titleId} className="text-2xl font-extrabold tracking-tight">
              {title}
            </h2>
            {description && <p className="mt-1 text-ink-soft">{description}</p>}
          </div>
          <button
            type="button"
            onClick={() => onCloseRef.current?.()}
            aria-label="Close"
            className="-mr-2 grid size-10 shrink-0 place-items-center rounded-full text-ink-soft transition-colors hover:bg-ink/[0.06] hover:text-ink"
          >
            <CloseIcon />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 pt-2 pb-6">{children}</div>
        {footer && (
          <div className="flex shrink-0 items-center justify-end gap-3 border-t border-rule px-6 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {footer}
          </div>
        )}
      </motion.div>
    </div>,
    document.body,
  )
}

// ---------- Toast ----------

const ToastContext = createContext(() => {})

/** const toast = useToast(); toast('Saved'); toast('Recorded…', { action: { label: 'Undo', onClick } }) */
export const useToast = () => useContext(ToastContext)

export function ToastProvider({ children }) {
  const [current, setCurrent] = useState(null)
  const timer = useRef(null)

  const dismiss = useCallback(() => {
    clearTimeout(timer.current)
    setCurrent(null)
  }, [])

  const toast = useCallback(
    (message, { action } = {}) => {
      clearTimeout(timer.current)
      const id = Date.now() + Math.random()
      setCurrent({ id, message, action })
      timer.current = setTimeout(() => setCurrent((t) => (t?.id === id ? null : t)), action ? 6000 : 3200)
    },
    [],
  )

  useEffect(() => () => clearTimeout(timer.current), [])

  return (
    <ToastContext.Provider value={toast}>
      {children}
      {createPortal(
        <div
          aria-live="polite"
          aria-atomic="true"
          className="pointer-events-none fixed inset-x-0 bottom-6 z-[60] flex justify-center px-4 pb-[env(safe-area-inset-bottom)]"
        >
          <AnimatePresence>
            {current && (
              <motion.div
                key={current.id}
                role="status"
                initial={{ opacity: 0, y: 24, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 12, scale: 0.98, transition: { duration: 0.2 } }}
                transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                className={cx(
                  'pointer-events-auto flex max-w-full items-center gap-3 rounded-full bg-ink py-2 text-paper shadow-[0_20px_40px_-20px_rgba(28,34,56,.8)]',
                  current.action ? 'pr-2 pl-5' : 'px-5',
                )}
              >
                <span className="min-w-0 py-1 text-sm font-medium sm:text-base">{current.message}</span>
                {current.action && (
                  <button
                    type="button"
                    onClick={() => {
                      dismiss()
                      current.action.onClick()
                    }}
                    className="h-9 shrink-0 rounded-full px-4 text-sm font-semibold text-pen-light transition-colors hover:bg-white/10"
                  >
                    {current.action.label}
                  </button>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  )
}
