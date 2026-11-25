// App shell: wordmark, global smooth scroll, hide-on-scroll nav, page transitions.
import { useEffect, useState } from 'react'
import { Link, Navigate, Outlet, useLocation, useNavigate, useOutlet } from 'react-router'
import { AnimatePresence, motion, useMotionValueEvent, useScroll } from 'motion/react'
import { useLogout, useMe } from '../lib/queries.js'
import { destroyLenis, scrollToTop, startLenis } from '../lib/smooth.js'
import { firstName } from '../lib/format.js'
import { Avatar, Button, EASE, ErrorNote, Skeleton, cx } from './ui.jsx'

// ---------- Wordmark ----------

/** Navy square with a white zero line, a green bar to its right and a red bar to its left. */
export function LogoMark({ size = 22, light = false }) {
  return (
    <svg width={size} height={size} viewBox="0 0 22 22" aria-hidden="true" className="shrink-0">
      <rect width="22" height="22" rx="6" fill={light ? '#F6F7F4' : '#1C2238'} />
      <rect x="5" y="12" width="5" height="3.5" rx="1" fill="#B23A3F" />
      <rect x="12" y="6.5" width="5" height="3.5" rx="1" fill="#0E7A5C" />
      <rect x="10.25" y="4" width="1.5" height="14" rx=".75" fill={light ? '#1C2238' : '#FFFFFF'} />
    </svg>
  )
}

export function Wordmark({ to, light = false, className }) {
  const content = (
    <>
      <LogoMark light={light} />
      <span>Splitly</span>
    </>
  )
  const classes = cx(
    'inline-flex items-center gap-2 text-lg font-extrabold tracking-tight',
    light ? 'text-paper' : 'text-ink',
    className,
  )
  if (!to) return <span className={classes}>{content}</span>
  return (
    <Link to={to} className={cx(classes, 'rounded-full')} aria-label="Splitly home">
      {content}
    </Link>
  )
}

// ---------- scrolling ----------

/** Runs the single global Lenis instance and scrolls to the top on every route change. */
export function SmoothScroll({ children }) {
  const { pathname } = useLocation()

  useEffect(() => {
    startLenis()
    return () => destroyLenis()
  }, [])

  useEffect(() => {
    scrollToTop()
  }, [pathname])

  return children
}

/** True while the user is scrolling down past `threshold`; false as soon as they scroll up. */
export function useHideOnScroll(threshold = 140) {
  const { scrollY } = useScroll()
  const [hidden, setHidden] = useState(false)
  useMotionValueEvent(scrollY, 'change', (y) => {
    const previous = scrollY.getPrevious() ?? 0
    setHidden(y > threshold && y > previous)
  })
  return hidden
}

export const navPill = 'flex h-12 items-center rounded-full bg-sheet/85 ring-1 ring-rule backdrop-blur-md'

/** Fixed header that slides away on scroll down. Shows again when it gets keyboard focus. */
export function FloatingNav({ children }) {
  const hidden = useHideOnScroll()
  const [focused, setFocused] = useState(false)
  return (
    <motion.header
      initial={false}
      animate={{ y: hidden && !focused ? '-120%' : '0%' }}
      transition={{ duration: 0.4, ease: EASE }}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={() => setFocused(false)}
      className="fixed inset-x-0 top-4 z-40 px-4 sm:px-6"
    >
      <nav className="mx-auto flex max-w-5xl items-center justify-between gap-3">{children}</nav>
    </motion.header>
  )
}

function AppNav({ user }) {
  const logout = useLogout()
  const navigate = useNavigate()

  const onLogout = () => {
    logout.mutate(undefined, { onSettled: () => navigate('/', { replace: true }) })
  }

  return (
    <FloatingNav>
      <div className={cx(navPill, 'px-4')}>
        <Wordmark to="/dashboard" />
      </div>
      <div className={cx(navPill, 'min-w-0 gap-2 pr-1.5 pl-1.5')}>
        <Avatar user={user} size="sm" />
        <span className="hidden max-w-[12rem] truncate font-semibold sm:inline">{firstName(user.name)}</span>
        <Button variant="ghost" size="sm" busy={logout.isPending} onClick={onLogout}>
          Log out
        </Button>
      </div>
    </FloatingNav>
  )
}

// ---------- layouts ----------

export const MAIN_CLASS = 'mx-auto w-full max-w-5xl px-4 pt-28 pb-28 sm:px-6 sm:pt-32'

/** Wraps every route: global smooth scroll. */
export function RootLayout() {
  return (
    <SmoothScroll>
      <Outlet />
    </SmoothScroll>
  )
}

/** Logged-in area: nav plus page transitions. Logged-out users go to /login. */
export function AppLayout() {
  const me = useMe()
  const location = useLocation()
  const outlet = useOutlet()

  if (me.isPending) {
    return (
      <main className={MAIN_CLASS}>
        <Skeleton rows={4} />
      </main>
    )
  }

  if (me.isError) {
    return (
      <main className={MAIN_CLASS}>
        <ErrorNote>Can't reach Splitly. Check your connection, then try again.</ErrorNote>
        <Button variant="secondary" className="mt-4" onClick={() => me.refetch()} busy={me.isFetching}>
          Try again
        </Button>
      </main>
    )
  }

  if (!me.data) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  }

  return (
    <>
      <AppNav user={me.data} />
      <AnimatePresence mode="wait" initial={false}>
        <motion.main
          key={location.pathname}
          className={MAIN_CLASS}
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE } }}
          exit={{ opacity: 0, y: -10, transition: { duration: 0.22, ease: EASE } }}
        >
          {outlet}
        </motion.main>
      </AnimatePresence>
    </>
  )
}
