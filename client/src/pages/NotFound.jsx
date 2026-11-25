import { Link } from 'react-router'
import { motion } from 'motion/react'
import { Wordmark } from '../components/Layout.jsx'
import { EASE, buttonClass } from '../components/ui.jsx'

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-svh max-w-5xl flex-col items-center justify-center px-6 py-16 text-center">
      <Wordmark to="/" className="mb-8" />
      <motion.p
        aria-hidden="true"
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: EASE }}
        className="num text-[clamp(8rem,32vw,17rem)] leading-none font-extrabold tracking-[-0.05em] text-ink/10"
      >
        404
      </motion.p>
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: EASE, delay: 0.15 }}
        className="flex flex-col items-center"
      >
        <h1 className="text-2xl font-extrabold tracking-tight">This page does not exist.</h1>
        <Link to="/dashboard" className={buttonClass('dark', 'lg', 'mt-8')}>
          Go to your groups
        </Link>
      </motion.div>
    </main>
  )
}
