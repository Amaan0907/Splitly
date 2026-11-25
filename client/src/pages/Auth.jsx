import { useEffect, useState } from 'react'
import { Link, Navigate, useLocation } from 'react-router'
import { Wordmark } from '../components/Layout.jsx'
import { Button, ErrorNote, Field, Skeleton, inputClass } from '../components/ui.jsx'
import { errorText } from '../lib/api.js'
import { useLogin, useMe, useRegister } from '../lib/queries.js'
import { ReceiptStack } from './landing/Hero.jsx'
import { RevealWords, Rise } from './landing/fx.jsx'

const COPY = {
  login: {
    title: 'Welcome back.',
    sub: 'Log in to see where everyone stands in your groups.',
    submit: 'Log in',
    aside: 'Every receipt from the trip, in one shared record.',
    switchText: 'New to Splitly?',
    switchLink: 'Create an account',
    switchTo: '/register',
  },
  register: {
    title: 'Start splitting.',
    sub: 'Make an account in a few seconds. It is free.',
    submit: 'Create account',
    aside: 'Add what you paid. Splitly works out who pays whom, to the paisa.',
    switchText: 'Already have an account?',
    switchLink: 'Log in',
    switchTo: '/login',
  },
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function validate(mode, values) {
  const errors = {}
  if (mode === 'register') {
    const name = values.name.trim()
    if (!name) errors.name = 'Enter your name so friends recognise you.'
    else if (name.length > 50) errors.name = 'Keep your name under 50 characters.'
  }
  if (!values.email.trim()) errors.email = 'Enter your email.'
  else if (!EMAIL_RE.test(values.email.trim())) errors.email = 'Enter an email like name@example.com.'
  if (!values.password) errors.password = 'Enter your password.'
  else if (mode === 'register' && values.password.length < 8) errors.password = 'Use at least 8 characters.'
  else if (values.password.length > 72) errors.password = 'Use 72 characters or fewer.'
  return errors
}

export default function Auth({ mode = 'login' }) {
  const copy = COPY[mode]
  const location = useLocation()
  const me = useMe()
  const login = useLogin()
  const register = useRegister()
  const mutation = mode === 'login' ? login : register

  const [values, setValues] = useState({ name: '', email: '', password: '' })
  const [errors, setErrors] = useState({})
  const [submitted, setSubmitted] = useState(false)

  // Switching between login and register keeps what was typed but clears old errors.
  useEffect(() => {
    setErrors({})
    setSubmitted(false)
    login.reset()
    register.reset()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode])

  const target = location.state?.from || '/dashboard'
  if (me.data) return <Navigate to={target} replace />

  const set = (key) => (e) => {
    const next = { ...values, [key]: e.target.value }
    setValues(next)
    if (submitted) setErrors(validate(mode, next))
  }

  const onSubmit = (e) => {
    e.preventDefault()
    setSubmitted(true)
    const found = validate(mode, values)
    setErrors(found)
    if (Object.keys(found).length > 0) return
    const body =
      mode === 'register'
        ? { name: values.name.trim(), email: values.email.trim(), password: values.password }
        : { email: values.email.trim(), password: values.password }
    mutation.mutate(body, {
      onError: (err) => {
        // Point server validation messages at the right field.
        const fieldErrors = {}
        for (const d of err?.details ?? []) {
          const key = String(d.path).split('.')[0]
          if (key in values && !fieldErrors[key]) fieldErrors[key] = d.message
        }
        if (Object.keys(fieldErrors).length) setErrors(fieldErrors)
      },
    })
    // On success useMe() gets the user and the <Navigate> above takes over.
  }

  const serverError =
    mutation.error && !(mutation.error.details?.length && Object.keys(errors).length) ? errorText(mutation.error) : null

  return (
    <div className="grid min-h-svh grid-cols-1 lg:grid-cols-2">
      <main className="flex min-w-0 flex-col px-4 py-6 sm:px-10 sm:py-8">
        <Wordmark to="/" className="self-start" />

        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-14">
          <RevealWords
            key={mode}
            text={copy.title}
            className="text-[clamp(2.8rem,6vw,4.4rem)] leading-[0.95] font-extrabold tracking-[-0.035em]"
          />
          <Rise key={`sub-${mode}`} delay={0.25} as="p" className="mt-4 text-lg text-ink-soft">
            {copy.sub}
          </Rise>

          {me.isPending ? (
            <Skeleton rows={3} className="mt-10" />
          ) : (
            <Rise delay={0.35}>
              <form noValidate onSubmit={onSubmit} className="mt-10 flex flex-col gap-5">
                {mode === 'register' && (
                  <Field label="Name" error={errors.name}>
                    {(p) => (
                      <input
                        {...p}
                        type="text"
                        autoComplete="name"
                        placeholder="Aisha Khan"
                        value={values.name}
                        onChange={set('name')}
                        className={inputClass}
                      />
                    )}
                  </Field>
                )}
                <Field label="Email" error={errors.email}>
                  {(p) => (
                    <input
                      {...p}
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      placeholder="you@example.com"
                      value={values.email}
                      onChange={set('email')}
                      className={inputClass}
                    />
                  )}
                </Field>
                <Field
                  label="Password"
                  hint={mode === 'register' ? 'At least 8 characters' : undefined}
                  error={errors.password}
                >
                  {(p) => (
                    <input
                      {...p}
                      type="password"
                      autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                      value={values.password}
                      onChange={set('password')}
                      className={inputClass}
                    />
                  )}
                </Field>

                <ErrorNote>{serverError}</ErrorNote>

                <Button type="submit" size="lg" busy={mutation.isPending} className="mt-2 w-full">
                  {copy.submit}
                </Button>
              </form>

              <p className="mt-8 text-ink-soft">
                {copy.switchText}{' '}
                <Link
                  to={copy.switchTo}
                  state={location.state}
                  replace
                  className="font-semibold text-pen underline decoration-2 underline-offset-4 hover:text-pen-dark"
                >
                  {copy.switchLink}
                </Link>
              </p>
            </Rise>
          )}
        </div>
      </main>

      <aside className="relative m-3 hidden flex-col justify-between overflow-hidden rounded-[2rem] bg-ink p-10 text-paper lg:flex xl:p-14">
        <div className="flex flex-1 items-center justify-center">
          <ReceiptStack />
        </div>
        <RevealWords
          key={`aside-${mode}`}
          as="p"
          text={copy.aside}
          delay={0.4}
          className="max-w-[18ch] text-[clamp(1.8rem,2.8vw,2.6rem)] leading-[1.02] font-extrabold tracking-[-0.03em]"
        />
      </aside>
    </div>
  )
}
