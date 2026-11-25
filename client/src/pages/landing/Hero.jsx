import { useEffect } from 'react'
import { Link } from 'react-router'
import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from 'motion/react'
import { Avatar, EASE, buttonClass, cx } from '../../components/ui.jsx'
import { LogoMark } from '../../components/Layout.jsx'
import { scrollToTarget } from '../../lib/smooth.js'
import { Magnetic, RevealWords, Rise } from './fx.jsx'

// ---------- receipts ----------

const RECEIPTS = [
  {
    id: 'dinner',
    title: 'Dinner at Thalassa',
    amount: '₹3,000',
    payer: { id: 1, name: 'Aisha' },
    split: 'Equally, 3 ways',
    date: '2 Nov',
    pos: 'left-0 top-10',
    rotate: -7,
    depth: 14,
  },
  {
    id: 'stay',
    title: 'Beach shack stay',
    amount: '₹6,400',
    payer: { id: 3, name: 'Meera' },
    split: 'Shares 2:1:1',
    date: '3 Nov',
    pos: 'left-14 top-0 sm:left-20',
    rotate: 5,
    depth: 26,
  },
  {
    id: 'cab',
    title: 'Cab from airport',
    amount: '₹1,500',
    payer: { id: 2, name: 'Rahul' },
    split: null,
    date: '1 Nov',
    pos: 'left-5 top-44 sm:left-10 sm:top-48',
    rotate: -2,
    depth: 40,
  },
]

// Torn bottom edge: a zig-zag clip-path.
const ZIGZAG = (() => {
  const teeth = 14
  const depth = 9
  const points = ['0 0', '100% 0', `100% calc(100% - ${depth}px)`]
  for (let k = teeth * 2 - 1; k >= 0; k -= 1) {
    const x = (k / (teeth * 2)) * 100
    points.push(`${x}% ${k % 2 === 0 ? `calc(100% - ${depth}px)` : '100%'}`)
  }
  return `polygon(${points.join(', ')})`
})()

function ReceiptPaper({ r }) {
  return (
    <div className="w-[14.5rem] bg-sheet px-5 pt-5 pb-8 text-ink sm:w-[16rem]" style={{ clipPath: ZIGZAG }}>
      <div className="flex items-center justify-between text-xs font-semibold text-ink-soft">
        <span className="flex items-center gap-1.5">
          <LogoMark size={14} /> Goa trip
        </span>
        <span>{r.date}</span>
      </div>
      <div className="my-3 border-t border-dashed border-rule" />
      <p className="leading-tight font-bold">{r.title}</p>
      <p className="num mt-1 text-4xl font-extrabold tracking-tight">{r.amount}</p>
      <div className="my-3 border-t border-dashed border-rule" />
      <div className="flex items-center gap-2 text-sm">
        <Avatar user={r.payer} size="sm" />
        <span>
          <span className="text-ink-soft">Paid by</span> <span className="font-semibold">{r.payer.name}</span>
        </span>
      </div>
      {r.split && <p className="mt-2 text-sm text-ink-soft">{r.split}</p>}
    </div>
  )
}

function Receipt({ r, index, mx, my, animated }) {
  const x = useTransform(mx, (v) => v * r.depth)
  const y = useTransform(my, (v) => v * r.depth)
  return (
    // layer 1: mouse parallax
    <motion.div className={cx('absolute', r.pos)} style={animated ? { x, y, zIndex: index } : { zIndex: index }}>
      {/* layer 2: drops in one after another */}
      <motion.div
        initial={animated ? { opacity: 0, y: -90, rotate: r.rotate * 1.8 } : false}
        animate={{ opacity: 1, y: 0, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 160, damping: 17, delay: 0.35 + index * 0.22 }}
      >
        {/* layer 3: tilt; straightens on hover */}
        <motion.div
          initial={false}
          animate={{ rotate: r.rotate }}
          whileHover={animated ? { rotate: 0, scale: 1.03 } : undefined}
          transition={{ type: 'spring', stiffness: 260, damping: 20 }}
          style={{ filter: 'drop-shadow(0 22px 30px rgba(28,34,56,.2))' }}
        >
          <ReceiptPaper r={r} />
        </motion.div>
      </motion.div>
    </motion.div>
  )
}

/** Three overlapping paper receipts from a Goa trip. Used in the hero and on the auth pages. */
export function ReceiptStack({ className }) {
  const reduce = useReducedMotion()
  const nx = useMotionValue(0)
  const ny = useMotionValue(0)
  const mx = useSpring(nx, { stiffness: 70, damping: 18 })
  const my = useSpring(ny, { stiffness: 70, damping: 18 })

  useEffect(() => {
    if (reduce) return undefined
    const onMove = (e) => {
      if (e.pointerType !== 'mouse') return
      nx.set((e.clientX / window.innerWidth) * 2 - 1)
      ny.set((e.clientY / window.innerHeight) * 2 - 1)
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    return () => window.removeEventListener('pointermove', onMove)
  }, [reduce, nx, ny])

  return (
    <div
      role="img"
      aria-label="Three receipts from a Goa trip: dinner at Thalassa for ₹3,000 paid by Aisha, a beach shack stay for ₹6,400 paid by Meera, and a cab from the airport for ₹1,500 paid by Rahul."
      className={cx('relative h-[25rem] w-[19rem] sm:h-[28rem] sm:w-[22rem]', className)}
    >
      {RECEIPTS.map((r, i) => (
        <Receipt key={r.id} r={r} index={i} mx={mx} my={my} animated={!reduce} />
      ))}
    </div>
  )
}

// ---------- hero ----------

function ScrollCue() {
  const reduce = useReducedMotion()
  return (
    <div
      aria-hidden="true"
      className="absolute bottom-8 left-4 hidden items-center gap-3 text-sm font-semibold text-ink-soft sm:left-6 sm:flex"
    >
      <span className="relative h-10 w-px overflow-hidden bg-ink/15">
        <motion.span
          className="absolute inset-x-0 top-0 h-4 bg-ink"
          animate={reduce ? undefined : { y: ['-100%', '250%'] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
        />
      </span>
      Scroll to untangle the trip
    </div>
  )
}

export default function Hero({ ctaTo = '/register' }) {
  const onHowItWorks = (e) => {
    e.preventDefault()
    scrollToTarget('#untangle')
  }

  return (
    <section className="relative mx-auto grid min-h-svh max-w-6xl grid-cols-1 items-center gap-14 px-4 pt-32 pb-24 sm:px-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:pt-28">
      <div className="min-w-0">
        <RevealWords
          text="Split the bill. Settle it in the fewest payments."
          className="max-w-[12ch] text-[clamp(3rem,7.4vw,6.6rem)] leading-[0.95] font-extrabold tracking-[-0.035em]"
          delay={0.1}
        />
        <Rise delay={0.55} className="mt-7 max-w-md text-lg text-ink-soft sm:text-xl">
          Add what everyone paid for the flat, the trip or last night&apos;s dinner. Splitly works out who owes
          whom, to the paisa, and turns it into the fewest payments.
        </Rise>
        <Rise delay={0.7} className="mt-10 flex flex-wrap items-center gap-x-8 gap-y-5">
          <Magnetic>
            <Link to={ctaTo} className={buttonClass('primary', 'lg', 'h-16 px-9 text-xl')}>
              Start splitting, free
            </Link>
          </Magnetic>
          <a
            href="#untangle"
            onClick={onHowItWorks}
            className="relative font-semibold after:absolute after:inset-x-0 after:-bottom-0.5 after:h-0.5 after:origin-left after:bg-ink after:transition-transform after:duration-300 hover:after:scale-x-[0.35]"
          >
            See how it works
          </a>
        </Rise>
      </div>

      <motion.div
        className="flex justify-center lg:justify-end"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6, ease: EASE }}
      >
        <ReceiptStack />
      </motion.div>

      <ScrollCue />
    </section>
  )
}
