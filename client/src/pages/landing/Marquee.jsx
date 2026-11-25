import { motion, useReducedMotion } from 'motion/react'

const COSTS = [
  ['Chai at the tapri', '₹120'],
  ['Netflix for the flat', '₹649'],
  ['Maggi at 2 a.m.', '₹180'],
  ['Electricity bill', '₹2,415.50'],
  ['Auto to college', '₹90'],
  ['Goa train tickets', '₹4,860'],
  ['Biryani for six', '₹1,140'],
  ['Wi-Fi recharge', '₹799'],
  ['Movie night', '₹1,200'],
  ['Groceries from DMart', '₹2,036'],
]

// The zero-line glyph from the logo: red bar, line, green bar.
function ZeroLine() {
  return (
    <svg width="26" height="20" viewBox="0 0 26 20" aria-hidden="true" className="shrink-0">
      <rect x="2" y="11" width="8" height="4.5" rx="1.2" fill="#B23A3F" />
      <rect x="16" y="4.5" width="8" height="4.5" rx="1.2" fill="#0E7A5C" />
      <rect x="12.1" y="1" width="1.8" height="18" rx=".9" fill="#1C2238" />
    </svg>
  )
}

function Row({ hidden }) {
  return (
    <ul aria-hidden={hidden || undefined} className="flex shrink-0 items-center">
      {COSTS.map(([label, amount]) => (
        <li
          key={label}
          className="flex shrink-0 items-center gap-8 pr-8 text-2xl font-extrabold tracking-tight whitespace-nowrap sm:text-3xl"
        >
          <span>
            {label} <span className="num text-pen">{amount}</span>
          </span>
          <ZeroLine />
        </li>
      ))}
    </ul>
  )
}

/** An endless loop of everyday Indian costs. */
export default function Marquee() {
  const reduce = useReducedMotion()
  return (
    <section aria-label="Everyday costs people split" className="overflow-hidden border-y border-rule bg-sheet py-6 sm:py-8">
      <motion.div
        className="flex w-max"
        animate={reduce ? undefined : { x: ['0%', '-50%'] }}
        transition={{ duration: 45, repeat: Infinity, ease: 'linear' }}
      >
        <Row />
        <Row hidden />
      </motion.div>
    </section>
  )
}
