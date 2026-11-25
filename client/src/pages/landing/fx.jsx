// Small motion helpers for the landing page.
import { Fragment, useEffect, useRef, useState } from 'react'
import {
  animate,
  motion,
  useInView,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  useSpring,
} from 'motion/react'
import { EASE, cx } from '../../components/ui.jsx'

/** Pulls its child gently toward the cursor. Mouse only; off under reduced motion. */
export function Magnetic({ children, strength = 0.3, className }) {
  const ref = useRef(null)
  const reduce = useReducedMotion()
  const spring = { stiffness: 220, damping: 16, mass: 0.6 }
  const x = useSpring(0, spring)
  const y = useSpring(0, spring)

  const onPointerMove = (e) => {
    if (reduce || e.pointerType !== 'mouse' || !ref.current) return
    const r = ref.current.getBoundingClientRect()
    x.set((e.clientX - (r.left + r.width / 2)) * strength)
    y.set((e.clientY - (r.top + r.height / 2)) * strength)
  }
  const reset = () => {
    x.set(0)
    y.set(0)
  }

  // The padding widens the area that "catches" the cursor; the negative margin cancels it in layout.
  return (
    <motion.div
      ref={ref}
      onPointerMove={onPointerMove}
      onPointerLeave={reset}
      style={{ x, y }}
      className={cx('-m-4 inline-block p-4 sm:-m-6 sm:p-6', className)}
    >
      {children}
    </motion.div>
  )
}

/**
 * Reveals a headline word by word: each word slides up from y:110% inside
 * its own overflow-hidden box. `inView` waits until it scrolls into view.
 */
export function RevealWords({
  text,
  as = 'h1',
  className,
  delay = 0,
  stagger = 0.06,
  inView = false,
}) {
  const reduce = useReducedMotion()
  const Plain = as
  if (reduce) return <Plain className={className}>{text}</Plain>

  const Tag = motion[as]
  const words = text.split(' ')
  const container = { hidden: {}, show: { transition: { staggerChildren: stagger, delayChildren: delay } } }
  const word = { hidden: { y: '110%' }, show: { y: '0%', transition: { duration: 0.9, ease: EASE } } }
  const trigger = inView
    ? { whileInView: 'show', viewport: { once: true, amount: 0.4 } }
    : { animate: 'show' }

  return (
    <Tag className={className} initial="hidden" variants={container} {...trigger}>
      <span className="sr-only">{text}</span>
      {words.map((w, i) => (
        <Fragment key={i}>
          <span aria-hidden="true" className="-mb-[0.12em] inline-block overflow-hidden pb-[0.12em] align-bottom">
            <motion.span className="inline-block" variants={word}>
              {w}
            </motion.span>
          </span>
          {i < words.length - 1 && ' '}
        </Fragment>
      ))}
    </Tag>
  )
}

/** Counts from `from` to `to` once it scrolls into view. */
export function CountUp({
  to,
  from = 0,
  duration = 1.4,
  delay = 0,
  format = (v) => Math.round(v).toLocaleString('en-IN'),
  className,
}) {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, amount: 0.6 })
  const reduce = useReducedMotion()
  const value = useMotionValue(reduce ? to : from)
  const [shown, setShown] = useState(value.get())

  useMotionValueEvent(value, 'change', setShown)

  useEffect(() => {
    if (reduce) {
      value.set(to)
      return undefined
    }
    if (!inView) return undefined
    const controls = animate(value, to, { duration, delay, ease: EASE })
    return () => controls.stop()
  }, [inView, reduce, to, duration, delay, value])

  return (
    <span ref={ref} className={cx('num', className)}>
      <span aria-hidden="true">{format(shown)}</span>
      <span className="sr-only">{format(to)}</span>
    </span>
  )
}

/** Fades up into view, once. */
export function Rise({ children, delay = 0, y = 24, as = 'div', className }) {
  const reduce = useReducedMotion()
  const Tag = motion[as]
  return (
    <Tag
      className={className}
      initial={reduce ? false : { opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.3 }}
      transition={{ duration: 0.8, ease: EASE, delay }}
    >
      {children}
    </Tag>
  )
}
