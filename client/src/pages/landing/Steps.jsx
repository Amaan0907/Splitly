// Three sticky cards that stack as you scroll. The card underneath shrinks
// and darkens (GSAP scrub) as the next one arrives.
import { useRef } from 'react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { useGSAP } from '@gsap/react'
import { useReducedMotion } from 'motion/react'
import { Avatar, cx } from '../../components/ui.jsx'
import { RevealWords } from './fx.jsx'

gsap.registerPlugin(ScrollTrigger, useGSAP)

const AISHA = { id: 1, name: 'Aisha' }
const RAHUL = { id: 2, name: 'Rahul' }
const MEERA = { id: 3, name: 'Meera' }
const KABIR = { id: 4, name: 'Kabir' }

// ---------- mini UI mocks (decorative) ----------

function SplitMock() {
  return (
    <div className="rounded-2xl bg-paper p-5">
      <p className="text-sm font-semibold text-ink-soft">Dinner at Thalassa</p>
      <p className="num text-4xl font-extrabold tracking-tight">₹3,000</p>
      <div className="mt-4 flex gap-0.5 overflow-hidden rounded-full bg-ink/[0.05] p-1 text-sm font-semibold">
        {['Equally', 'Exact', 'Percent', 'Shares'].map((t, i) => (
          <span
            key={t}
            className={cx(
              'rounded-full px-3 py-1.5 whitespace-nowrap',
              i === 0 ? 'bg-sheet text-ink shadow-sm ring-1 ring-rule' : 'text-ink-soft',
            )}
          >
            {t}
          </span>
        ))}
      </div>
      <ul className="mt-4 space-y-2">
        {[AISHA, RAHUL, MEERA].map((u) => (
          <li key={u.id} className="flex items-center gap-3 rounded-xl bg-sheet px-3 py-2">
            <span className="grid size-5 place-items-center rounded-md bg-pen text-[10px] text-white">✓</span>
            <Avatar user={u} size="sm" />
            <span className="flex-1 font-semibold">{u.name}</span>
            <span className="num font-semibold">₹1,000</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function ChartMock() {
  const rows = [
    [AISHA, 1300],
    [RAHUL, -300],
    [MEERA, -400],
    [KABIR, -600],
  ]
  const max = 1300
  return (
    <div className="rounded-2xl bg-paper p-5">
      <div className="relative space-y-3">
        <span className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 rounded-full bg-ink" />
        {rows.map(([u, v]) => (
          <div key={u.id} className="grid grid-cols-2 items-center">
            <div className="flex h-9 items-center justify-end pr-1">
              {v < 0 && (
                <span className="h-7 rounded-l-lg bg-owe" style={{ width: `${(Math.abs(v) / max) * 100}%` }} />
              )}
            </div>
            <div className="flex h-9 items-center pl-1">
              {v > 0 && <span className="h-7 rounded-r-lg bg-owed" style={{ width: `${(v / max) * 100}%` }} />}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
        {rows.map(([u, v]) => (
          <p key={u.id} className="flex items-center gap-2">
            <Avatar user={u} size="sm" />
            <span className={v > 0 ? 'text-owed' : 'text-owe'}>
              <span className="font-semibold text-ink">{u.name}</span> {v > 0 ? 'gets back' : 'owes'}{' '}
              <span className="num font-semibold">₹{Math.abs(v).toLocaleString('en-IN')}</span>
            </span>
          </p>
        ))}
      </div>
    </div>
  )
}

function SettleMock() {
  const cards = [
    [KABIR, '₹600', true],
    [MEERA, '₹400', false],
  ]
  return (
    <div className="space-y-3 rounded-2xl bg-paper p-5">
      {cards.map(([u, amount, primary]) => (
        <div key={u.id} className="rounded-2xl bg-sheet p-4 ring-1 ring-rule">
          <div className="flex items-center gap-2">
            <Avatar user={u} size="sm" />
            <span className="text-ink-soft">→</span>
            <Avatar user={AISHA} size="sm" />
            <span className="ml-1 text-sm font-semibold">{u.name} pays Aisha</span>
          </div>
          <div className="mt-3 flex items-end justify-between gap-3">
            <span className="num text-3xl font-extrabold tracking-tight">{amount}</span>
            <span
              className={cx(
                'rounded-full px-4 py-2 text-sm font-semibold',
                primary ? 'bg-pen text-white' : 'bg-sheet text-ink ring-1 ring-rule',
              )}
            >
              Record payment
            </span>
          </div>
        </div>
      ))}
    </div>
  )
}

const STEPS = [
  {
    title: 'Add what you paid',
    text: 'Type the amount and tick who was in. Split it equally, by exact amounts, by percent or by shares.',
    Mock: SplitMock,
  },
  {
    title: 'See who owes whom',
    text: 'Every expense updates everyone’s balance at once. Green is coming back to you, red is what you owe.',
    Mock: ChartMock,
  },
  {
    title: 'Settle in the fewest payments',
    text: 'Splitly suggests who pays whom. Pay by cash or UPI, then record it so the balance clears.',
    Mock: SettleMock,
  },
]

export default function Steps() {
  const root = useRef(null)
  const reduce = useReducedMotion()

  useGSAP(
    () => {
      if (reduce) return
      const cards = gsap.utils.toArray('.step-card', root.current)
      cards.forEach((card, i) => {
        const next = cards[i + 1]
        if (!next) return
        const nextTop = 96 + (i + 1) * 24 // matches top: calc(6rem + n*1.5rem)
        const trigger = { trigger: next, start: 'top bottom', end: `top ${nextTop}px`, scrub: true }
        gsap.to(card.querySelector('.step-inner'), { scale: 0.93, ease: 'none', scrollTrigger: trigger })
        gsap.to(card.querySelector('.step-shade'), { opacity: 0.14, ease: 'none', scrollTrigger: { ...trigger } })
      })
    },
    { scope: root, dependencies: [reduce] },
  )

  return (
    <section className="mx-auto max-w-6xl px-4 pt-8 pb-28 sm:px-6 sm:pb-36">
      <RevealWords
        as="h2"
        inView
        text="From receipt to settled in three steps."
        className="max-w-[14ch] text-[clamp(2.6rem,5.6vw,4.6rem)] leading-[0.95] font-extrabold tracking-[-0.035em]"
      />
      <ol ref={root} className="mt-16 space-y-[28vh]">
        {STEPS.map(({ title, text, Mock }, i) => (
          <li key={title} className="step-card sticky" style={{ top: `calc(6rem + ${i * 1.5}rem)` }}>
            <article className="step-inner relative grid origin-top grid-cols-1 items-center gap-8 overflow-hidden rounded-3xl bg-sheet p-6 ring-1 ring-rule sm:p-10 md:min-h-[26rem] md:grid-cols-2 md:gap-12">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-pen">Step {i + 1} of 3</p>
                <h3 className="mt-3 text-[clamp(1.8rem,3.6vw,2.8rem)] leading-[1] font-extrabold tracking-[-0.03em]">
                  {title}
                </h3>
                <p className="mt-4 max-w-sm text-lg text-ink-soft">{text}</p>
              </div>
              <div aria-hidden="true" className="min-w-0">
                <Mock />
              </div>
              <div aria-hidden="true" className="step-shade pointer-events-none absolute inset-0 bg-ink opacity-0" />
            </article>
          </li>
        ))}
      </ol>
    </section>
  )
}
