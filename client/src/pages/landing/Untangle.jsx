// The signature scene: a pinned, scrubbed GSAP timeline that untangles
// 6 debts between four friends into 3 payments.
import { useRef } from 'react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { useGSAP } from '@gsap/react'
import { useReducedMotion } from 'motion/react'
import { avatarColor } from '../../components/ui.jsx'
import { formatMoney } from '../../lib/money.js'

gsap.registerPlugin(ScrollTrigger, useGSAP)

const OWE = '#F08A8E'
const OWED = '#5FD0AE'
const PEN = '#8FA0FF'
const PAPER = '#F6F7F4'
const INK = '#1C2238'

// Nets: Aisha +1,300; Rahul −300; Meera −400; Kabir −600 (they total zero).
const PEOPLE = [
  { id: 1, name: 'Aisha', x: 90, y: 90, net: 130000, top: true },
  { id: 2, name: 'Rahul', x: 310, y: 90, net: -30000, top: true },
  { id: 3, name: 'Meera', x: 310, y: 310, net: -40000, top: false },
  { id: 4, name: 'Kabir', x: 90, y: 310, net: -60000, top: false },
]
const byId = Object.fromEntries(PEOPLE.map((p) => [p.id, p]))

// One debt per pair; together they produce the nets above.
const DEBTS = [
  { from: 2, to: 1, cents: 50000, bend: 60 },
  { from: 3, to: 1, cents: 30000, bend: 80 },
  { from: 4, to: 1, cents: 50000, bend: -60 },
  { from: 2, to: 3, cents: 20000, bend: -60 },
  { from: 4, to: 2, cents: 40000, bend: -80 },
  { from: 3, to: 4, cents: 30000, bend: -60 },
]

// Simplified: everyone pays Aisha.
const PAYMENTS = [
  { from: 2, to: 1, cents: 30000, bend: -40 },
  { from: 3, to: 1, cents: 40000, bend: 0 },
  { from: 4, to: 1, cents: 60000, bend: 40 },
]

const CAPTIONS = [
  'Four friends, one Goa trip…',
  '…that is 6 transfers',
  'Splitly adds it all up…',
  'Same balances, settled in 3 transfers.',
]

/** A quadratic curve between two nodes, stopping short of each circle. */
function curve(a, b, bend) {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len = Math.hypot(dx, dy)
  const ux = dx / len
  const uy = dy / len
  const s = { x: a.x + ux * 38, y: a.y + uy * 38 }
  const e = { x: b.x - ux * 42, y: b.y - uy * 42 }
  const m = { x: (s.x + e.x) / 2 - uy * bend, y: (s.y + e.y) / 2 + ux * bend }
  return {
    d: `M${s.x} ${s.y} Q${m.x} ${m.y} ${e.x} ${e.y}`,
    // point on the curve at t = 0.5
    lx: 0.25 * s.x + 0.5 * m.x + 0.25 * e.x,
    ly: 0.25 * s.y + 0.5 * m.y + 0.25 * e.y,
  }
}

function Arrow({ edge, kind }) {
  const { d, lx, ly } = curve(byId[edge.from], byId[edge.to], edge.bend)
  const colour = kind === 'debt' ? OWE : PEN
  const text = formatMoney(edge.cents)
  const width = 16 + text.length * 7.6
  // Final state (also the reduced-motion view): debts faded to 12%, payments solid.
  return (
    <g className={kind} style={{ opacity: kind === 'debt' ? 0.12 : 1 }}>
      <path
        className={`${kind}-path`}
        d={d}
        fill="none"
        stroke={colour}
        strokeWidth={kind === 'debt' ? 2 : 2.5}
        strokeLinecap="round"
        markerEnd={`url(#arrow-${kind})`}
      />
      <g transform={`translate(${lx} ${ly})`}>
        <g className={`${kind}-pill`}>
          <rect x={-width / 2} y={-11} width={width} height={22} rx={11} fill={INK} stroke={colour} strokeWidth={1.5} />
          <text textAnchor="middle" dominantBaseline="central" fontSize="12" fontWeight="700" fill={colour}>
            {text}
          </text>
        </g>
      </g>
    </g>
  )
}

function Person({ p }) {
  const owed = p.net > 0
  const nameY = p.top ? -42 : 50
  const netY = p.top ? -62 : 70
  return (
    <g transform={`translate(${p.x} ${p.y})`}>
      <g className="node">
        <circle r="28" fill={avatarColor(p.id)} stroke="rgba(246,247,244,.25)" strokeWidth="2" />
        <text textAnchor="middle" dominantBaseline="central" fontSize="20" fontWeight="800" fill="#fff">
          {p.name[0]}
        </text>
        <text y={nameY} textAnchor="middle" dominantBaseline="central" fontSize="14" fontWeight="700" fill={PAPER}>
          {p.name}
        </text>
      </g>
      <text
        className="net"
        y={netY}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize="13"
        fontWeight="700"
        fill={owed ? OWED : OWE}
      >
        {owed ? 'gets back' : 'owes'} {formatMoney(Math.abs(p.net))}
      </text>
    </g>
  )
}

export default function Untangle() {
  const root = useRef(null)
  const counterRef = useRef(null)
  const reduce = useReducedMotion()

  useGSAP(
    () => {
      // Under reduced motion the markup already shows the final state, with no pinning.
      if (reduce) return
      const q = gsap.utils.selector(root)

      for (const path of q('.debt-path, .pay-path')) {
        const len = path.getTotalLength()
        gsap.set(path, { strokeDasharray: len, strokeDashoffset: len })
      }
      gsap.set(q('.node'), { scale: 0, opacity: 0, transformOrigin: '50% 50%' })
      gsap.set(q('.debt, .pay'), { opacity: 0 }) // keeps arrowheads hidden until each line draws
      gsap.set(q('.debt-pill, .pay-pill'), { scale: 0.6, opacity: 0, transformOrigin: '50% 50%' })
      gsap.set(q('.net'), { opacity: 0, y: 6 })
      const caps = q('.caption')
      gsap.set(caps, { opacity: 0, y: 16 })
      gsap.set(caps[0], { opacity: 1, y: 0 })

      const counter = counterRef.current
      const proxy = { v: 0 }
      const render = () => {
        counter.textContent = String(Math.round(proxy.v))
      }
      render()
      gsap.set(counter, { color: PAPER })

      const tl = gsap.timeline({
        defaults: { ease: 'none' },
        scrollTrigger: {
          trigger: root.current,
          start: 'top top',
          end: '+=3200',
          scrub: 0.8,
          pin: true,
          anticipatePin: 1,
        },
      })

      const swap = (from, to, at) => {
        tl.to(caps[from], { opacity: 0, y: -16, duration: 0.4 }, at)
        tl.to(caps[to], { opacity: 1, y: 0, duration: 0.4 }, at + 0.2)
      }

      const draw = (group, kind, at) => {
        tl.to(group, { opacity: 1, duration: 0.05 }, at)
        tl.to(group.querySelector(`.${kind}-path`), { strokeDashoffset: 0, duration: 0.5 }, at)
        tl.to(group.querySelector(`.${kind}-pill`), { opacity: 1, scale: 1, duration: 0.25 }, at + 0.35)
      }

      // 1. people pop in
      tl.to(q('.node'), { scale: 1, opacity: 1, duration: 0.5, stagger: 0.15, ease: 'back.out(2)' }, 0)

      // 2. six debts draw themselves; the counter rolls 0 → 6
      swap(0, 1, 1.1)
      q('.debt').forEach((g, i) => {
        const at = 1.4 + i * 0.4
        draw(g, 'debt', at)
        tl.to(proxy, { v: i + 1, duration: 0.25, onUpdate: render }, at + 0.2)
      })

      // 3. nets appear
      swap(1, 2, 4.3)
      tl.to(q('.net'), { opacity: 1, y: 0, duration: 0.4, stagger: 0.15 }, 4.5)

      // 4. debts fade, three payments draw; the counter rolls to 3 and turns green
      tl.to(q('.debt'), { opacity: 0.12, duration: 0.5 }, 5.6)
      swap(2, 3, 5.8)
      q('.pay').forEach((g, i) => draw(g, 'pay', 6.1 + i * 0.45))
      tl.to(proxy, { v: 3, duration: 1.2, onUpdate: render }, 6.1)
      tl.to(counter, { color: OWED, duration: 0.4 }, 7.2)

      // hold the final state for a moment before unpinning
      tl.to({}, { duration: 1 }, 7.6)
    },
    { scope: root, dependencies: [reduce] },
  )

  return (
    <section id="untangle" ref={root} className="relative overflow-hidden bg-ink text-paper">
      <p className="sr-only">
        Four friends on a Goa trip end up with 6 transfers between them. Splitly adds up everyone&apos;s balance
        and settles the same amounts in 3 transfers, all paid to Aisha.
      </p>
      <div
        aria-hidden="true"
        className="mx-auto grid min-h-svh max-w-6xl grid-cols-1 content-center items-center gap-6 px-4 py-16 sm:px-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-12"
      >
        <div className="min-w-0">
          <p className="text-sm font-semibold text-paper/60 sm:text-base">Transfers needed to settle up</p>
          <span
            ref={counterRef}
            className="num block text-[clamp(6rem,18vw,13rem)] leading-[0.9] font-extrabold tracking-[-0.05em] text-owed-light"
          >
            3
          </span>
          <div className="relative mt-4 h-20 max-w-md sm:h-24">
            {CAPTIONS.map((c, i) => (
              <p
                key={c}
                className="caption absolute inset-x-0 top-0 text-2xl leading-tight font-extrabold tracking-tight sm:text-3xl"
                style={{ opacity: i === CAPTIONS.length - 1 ? 1 : 0 }}
              >
                {c}
              </p>
            ))}
          </div>
        </div>

        <svg viewBox="0 0 400 400" className="mx-auto w-full max-w-[21rem] sm:max-w-[28rem] lg:max-w-[32rem]">
          <defs>
            {[
              ['debt', OWE],
              ['pay', PEN],
            ].map(([kind, colour]) => (
              <marker
                key={kind}
                id={`arrow-${kind}`}
                viewBox="0 0 10 10"
                refX="6"
                refY="5"
                markerWidth="5"
                markerHeight="5"
                orient="auto-start-reverse"
              >
                <path d="M0 0L10 5L0 10z" fill={colour} />
              </marker>
            ))}
          </defs>
          <g>
            {DEBTS.map((e) => (
              <Arrow key={`d${e.from}-${e.to}`} edge={e} kind="debt" />
            ))}
          </g>
          <g>
            {PAYMENTS.map((e) => (
              <Arrow key={`p${e.from}-${e.to}`} edge={e} kind="pay" />
            ))}
          </g>
          {PEOPLE.map((p) => (
            <Person key={p.id} p={p} />
          ))}
        </svg>
      </div>
    </section>
  )
}
