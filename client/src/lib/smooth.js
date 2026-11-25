// One global Lenis instance, driven by gsap.ticker so ScrollTrigger and Lenis
// share a single frame loop. Skipped entirely under prefers-reduced-motion.
import Lenis from 'lenis'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

let lenis = null
let tick = null

export function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function startLenis() {
  if (lenis || prefersReducedMotion()) return lenis
  lenis = new Lenis({ autoRaf: false, lerp: 0.1, wheelMultiplier: 1 })
  lenis.on('scroll', ScrollTrigger.update)
  tick = (time) => lenis.raf(time * 1000)
  gsap.ticker.add(tick)
  gsap.ticker.lagSmoothing(0)
  return lenis
}

export function destroyLenis() {
  if (!lenis) return
  gsap.ticker.remove(tick)
  lenis.destroy()
  lenis = null
  tick = null
}

export function getLenis() {
  return lenis
}

export function scrollToTop() {
  if (lenis) lenis.scrollTo(0, { immediate: true, force: true })
  else window.scrollTo(0, 0)
}

export function scrollToTarget(target, options) {
  if (lenis) lenis.scrollTo(target, { offset: -24, ...options })
  else document.querySelector(target)?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
}

// Used by Modal: stop smooth scrolling while a dialog is open.
export function pauseScroll() {
  lenis?.stop()
}

export function resumeScroll() {
  lenis?.start()
}
