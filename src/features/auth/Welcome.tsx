import { Link, Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { ArrowLeft, Heart, Mail, Tablet } from 'lucide-react'
import { useAuth } from './AuthProvider'
import CodeLogin from './CodeLogin'
import TabletPair from './TabletPair'

/**
 * Drie deuren, omdat er drie soorten mensen binnenkomen: wie zorgt, wie
 * uitgenodigd werd, en de tablet van de persoon zelf. Eén formulier voor
 * alle drie was precies waarom het inloggen onduidelijk voelde.
 */
export default function Welcome() {
  const { session, loading } = useAuth()

  if (loading) return <p className="p-6 text-ink-soft">Even geduld…</p>
  if (session) return <Navigate to="/" replace />

  return (
    <main className="mx-auto min-h-screen max-w-[30rem] px-5 py-10">
      <Routes>
        <Route index element={<Deuren />} />
        <Route
          path="familie"
          element={
            <Stap>
              <CodeLogin />
            </Stap>
          }
        />
        <Route
          path="uitnodiging"
          element={
            <Stap>
              <UitnodigingInvullen />
            </Stap>
          }
        />
        <Route
          path="tablet"
          element={
            <Stap>
              <TabletPair />
            </Stap>
          }
        />
      </Routes>
    </main>
  )
}

function Deuren() {
  return (
    <>
      <div className="grid h-14 w-14 place-items-center rounded-2xl bg-accent-ink text-2xl text-white shadow-lift">
        🏡
      </div>
      <h1 className="mt-6 text-[2.2rem] font-extrabold leading-tight tracking-tight">
        Welkom bij Thuis
      </h1>
      <p className="mt-2 text-lg text-ink-soft">
        Een digitaal geheugen voor elke dag. Hoe kom je binnen?
      </p>

      <div className="mt-8 space-y-3">
        {/* Neutraal geformuleerd: de app is er ook voor wie ze zelf gebruikt.
            "Ik zorg voor iemand" als enige hoofddeur sloot die persoon
            buiten, net nu de persoon eigenaar kan zijn. */}
        <Deur
          naar="/login/familie"
          icoon={<Heart size={24} strokeWidth={1.75} />}
          titel="Inloggen of beginnen"
          onder="Voor jezelf, of voor iemand voor wie je zorgt."
          hoofd
        />
        <Deur
          naar="/login/uitnodiging"
          icoon={<Mail size={24} strokeWidth={1.75} />}
          titel="Ik heb een uitnodiging"
          onder="Iemand heeft je een link of code gestuurd."
        />
        <Deur
          naar="/login/tablet"
          icoon={<Tablet size={24} strokeWidth={1.75} />}
          titel="Dit is de tablet van de persoon"
          onder="Eén keer koppelen met een code."
        />
      </div>
    </>
  )
}

function Deur({
  naar,
  icoon,
  titel,
  onder,
  hoofd,
}: {
  naar: string
  icoon: React.ReactNode
  titel: string
  onder: string
  hoofd?: boolean
}) {
  return (
    <Link
      to={naar}
      className={`flex items-center gap-4 rounded-card p-5 shadow-card ${
        hoofd ? 'bg-accent-ink text-white shadow-lift' : 'bg-surface'
      }`}
    >
      <span
        className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl ${
          hoofd ? 'bg-white/15' : 'bg-accent-soft text-accent-ink'
        }`}
      >
        {icoon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-lg font-bold">{titel}</span>
        <span className={`block text-sm ${hoofd ? 'text-white/80' : 'text-ink-soft'}`}>
          {onder}
        </span>
      </span>
    </Link>
  )
}

function Stap({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Link
        to="/login"
        className="inline-flex items-center gap-1.5 font-semibold text-accent-ink"
      >
        <ArrowLeft size={18} strokeWidth={1.75} />
        Terug
      </Link>
      <div className="mt-6">{children}</div>
    </>
  )
}

/**
 * Wie de mail op een ander toestel las, kan de link of alleen het token
 * hier plakken. We halen er het token uit en gaan door naar de gewone
 * uitnodigingspagina.
 */
function UitnodigingInvullen() {
  const [waarde, setWaarde] = useState('')
  const [fout, setFout] = useState<string | null>(null)
  const navigate = useNavigate()

  function verder(e: React.FormEvent) {
    e.preventDefault()
    const v = waarde.trim()
    const uitLink = v.match(/token=([A-Za-z0-9_-]+)/)
    const token = uitLink ? uitLink[1] : /^[A-Za-z0-9_-]{16,}$/.test(v) ? v : null
    if (!token) {
      setFout('Dat lijkt geen uitnodiging. Plak de volledige link uit de mail.')
      return
    }
    navigate(`/uitnodiging?token=${token}`)
  }

  return (
    <form onSubmit={verder} className="rounded-card bg-surface p-6 shadow-lift">
      <h2 className="text-2xl font-bold tracking-tight">Je uitnodiging</h2>
      <p className="mt-2 text-ink-soft">
        Klik op de link in de mail. Of plak hem hier als je de mail op een ander toestel las.
      </p>
      <textarea
        value={waarde}
        onChange={(e) => {
          setWaarde(e.target.value)
          setFout(null)
        }}
        rows={3}
        placeholder="https://…/uitnodiging?token=…"
        className="mt-5 w-full rounded-2xl border-[1.5px] border-line-strong bg-surface px-4 py-3"
      />
      <button
        type="submit"
        className="mt-4 flex min-h-[3.2rem] w-full items-center justify-center rounded-pill bg-accent-ink px-5 text-lg font-semibold text-white"
      >
        Verder
      </button>
      {fout ? (
        <p role="alert" className="mt-4 rounded-2xl bg-alert-soft p-3 text-sm text-alert">
          {fout}
        </p>
      ) : null}
    </form>
  )
}
