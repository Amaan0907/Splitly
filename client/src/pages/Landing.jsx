import { Link } from 'react-router'
import { FloatingNav, Wordmark, navPill } from '../components/Layout.jsx'
import { buttonClass, cx } from '../components/ui.jsx'
import { useMe } from '../lib/queries.js'
import Hero from './landing/Hero.jsx'
import Marquee from './landing/Marquee.jsx'
import { Magnetic, RevealWords, Rise } from './landing/fx.jsx'

function LandingNav({ loggedIn }) {
  return (
    <FloatingNav>
      <div className={cx(navPill, 'px-4')}>
        <Wordmark to="/" />
      </div>
      <div className={cx(navPill, 'gap-1 px-1.5')}>
        {loggedIn ? (
          <Link to="/dashboard" className={buttonClass('dark', 'sm')}>
            Open Splitly
          </Link>
        ) : (
          <>
            <Link to="/login" className={buttonClass('ghost', 'sm')}>
              Log in
            </Link>
            <Link to="/register" className={buttonClass('dark', 'sm')}>
              Sign up
            </Link>
          </>
        )}
      </div>
    </FloatingNav>
  )
}

function Finale({ ctaTo }) {
  return (
    <section className="overflow-hidden rounded-t-[2rem] bg-ink text-paper">
      <div className="mx-auto max-w-6xl px-4 pt-28 pb-10 sm:px-6 sm:pt-36">
        <RevealWords
          as="h2"
          inView
          text="Settle up."
          className="text-[clamp(5rem,17vw,15rem)] leading-[0.95] font-extrabold tracking-[-0.05em]"
        />
        <Rise delay={0.2} className="mt-8 flex flex-col gap-10 sm:flex-row sm:items-end sm:justify-between">
          <p className="max-w-sm text-xl text-paper/70 sm:text-2xl">
            Start a group before the next trip, not after it.
          </p>
          <Magnetic>
            <Link to={ctaTo} className={buttonClass('light', 'lg', 'h-16 px-9 text-xl')}>
              Start splitting, free
            </Link>
          </Magnetic>
        </Rise>

        <footer className="mt-28 flex flex-col gap-4 border-t border-white/15 pt-8 text-sm text-paper/60 sm:flex-row sm:items-center sm:justify-between">
          <Wordmark to="/" light />
          <p className="max-w-md">Splitly records payments you make by cash or UPI. It never moves money.</p>
        </footer>
      </div>
    </section>
  )
}

export default function Landing() {
  const { data: me } = useMe()
  const ctaTo = me ? '/dashboard' : '/register'
  return (
    <>
      <LandingNav loggedIn={!!me} />
      <main>
        <Hero ctaTo={ctaTo} />
        <Marquee />
        {/* Untangle, MoneyRules and Steps arrive in stage 5. */}
        <div className="h-32 sm:h-40" />
        <Finale ctaTo={ctaTo} />
      </main>
    </>
  )
}
