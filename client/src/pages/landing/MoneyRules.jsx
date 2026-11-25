import { motion, useReducedMotion } from 'motion/react'
import { EASE, cx } from '../../components/ui.jsx'
import { formatMoney } from '../../lib/money.js'
import { CountUp, RevealWords, Rise } from './fx.jsx'

const SHARES = [3334, 3333, 3333]

const RULES = [
  [
    'Money is stored in paise',
    'Every amount is a whole number of paise, so rounding errors never creep into your balances.',
  ],
  ['Balances always total zero', 'What one person gets back, the others owe. The group’s books always add up.'],
  [
    'Nothing quietly disappears',
    'Deleted expenses stay in the activity history, and every recorded payment can be undone.',
  ],
  ['Only your group can see it', 'Groups are private. Only the people in a group see its expenses and balances.'],
]

const paise = (v) => formatMoney(Math.round(v), 'INR', { fraction: 2 })

// One bar splits into three blocks that count up to ₹33.34 / ₹33.33 / ₹33.33.
function SplitDemo() {
  const reduce = useReducedMotion()
  const radius = (i) => {
    if (i === 0) return '1rem 0 0 1rem'
    if (i === SHARES.length - 1) return '0 1rem 1rem 0'
    return '0'
  }
  return (
    <div className="rounded-3xl bg-sheet p-6 ring-1 ring-rule sm:p-8">
      <p className="text-sm font-semibold text-ink-soft">₹100 split three ways</p>
      <p className="num mt-1 text-5xl font-extrabold tracking-tight">₹100.00</p>

      <motion.div
        className="mt-8 flex"
        initial={reduce ? 'split' : 'joined'}
        whileInView="split"
        viewport={{ once: true, amount: 0.7 }}
        variants={{
          joined: { gap: '0rem' },
          split: { gap: '0.75rem', transition: { duration: 0.8, ease: EASE, delay: 0.3 } },
        }}
      >
        {SHARES.map((cents, i) => (
          <div key={i} className="min-w-0 flex-1">
            <motion.div
              variants={{
                joined: { borderRadius: radius(i) },
                split: { borderRadius: '1rem', transition: { duration: 0.8, ease: EASE, delay: 0.3 } },
              }}
              className={cx(
                'flex h-24 items-end bg-pen p-3 text-white sm:h-28 sm:p-4',
                i === 1 && 'bg-pen/85',
                i === 2 && 'bg-pen/70',
              )}
            >
              <CountUp
                to={cents}
                delay={0.7}
                duration={1.2}
                format={paise}
                className="text-base font-extrabold tracking-tight sm:text-2xl"
              />
            </motion.div>
            {i === 0 && (
              <motion.p
                initial={reduce ? false : { opacity: 0, y: -6 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, ease: EASE, delay: 1.9 }}
                className="mt-2 text-sm font-semibold text-pen"
              >
                + the extra paisa
              </motion.p>
            )}
          </div>
        ))}
      </motion.div>

      <p className="mt-6 text-ink-soft">
        ₹33.33 three times is ₹99.99. Splitly gives the leftover paisa to one person, so the shares always add up
        to the bill.
      </p>
    </div>
  )
}

export default function MoneyRules() {
  return (
    <section className="mx-auto grid max-w-6xl grid-cols-1 gap-12 px-4 py-28 sm:px-6 sm:py-36 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-16">
      <div className="min-w-0 self-start lg:sticky lg:top-32">
        <RevealWords
          as="h2"
          inView
          text="Built to get the money right."
          className="max-w-[11ch] text-[clamp(2.6rem,5.6vw,4.6rem)] leading-[0.95] font-extrabold tracking-[-0.035em]"
        />
        <Rise delay={0.2} as="p" className="mt-6 max-w-sm text-lg text-ink-soft">
          Small amounts add up between friends. Splitly keeps every paisa accounted for.
        </Rise>
      </div>

      <div className="min-w-0">
        <Rise>
          <SplitDemo />
        </Rise>
        <dl className="mt-12 grid grid-cols-1 border-t-2 border-ink sm:grid-cols-2 sm:gap-x-10">
          {RULES.map(([title, text], i) => (
            <Rise key={title} delay={(i % 2) * 0.1} className="border-b border-rule py-6">
              <dt className="text-lg font-extrabold tracking-tight">{title}</dt>
              <dd className="mt-1.5 text-ink-soft">{text}</dd>
            </Rise>
          ))}
        </dl>
      </div>
    </section>
  )
}
