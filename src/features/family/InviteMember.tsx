import { useState } from 'react'
import { supabase } from '../../lib/supabase'

interface Props {
  householdId: string
  personName: string
}

/**
 * De beheerder maakt een uitnodiging en krijgt een link terug. Die mail
 * je zelf; automatisch versturen is een edge function, en die hoeft niet
 * te bestaan om dit te kunnen gebruiken.
 */
export default function InviteMember({ householdId, personName }: Props) {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('member')
  const [relation, setRelation] = useState('')
  const [link, setLink] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [verstuurd, setVerstuurd] = useState(false)

  async function maak(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setLink(null)
    try {
      const { data, error } = await supabase.rpc('create_invite', {
        hh: householdId,
        invitee_email: email.trim(),
        invitee_role: role,
        invitee_relation: relation.trim() || null,
      })
      if (error) throw error
      const rij = Array.isArray(data) ? data[0] : data
      setLink(`${window.location.origin}/uitnodiging?token=${rij.token}`)

      // Mail versturen mag mislukken: de link staat er hoe dan ook, en
      // doorsturen via WhatsApp werkt even goed.
      try {
        const { error: mailError } = await supabase.functions.invoke('send-invite', {
          body: { invite_id: rij.id },
        })
        setVerstuurd(!mailError)
      } catch {
        setVerstuurd(false)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Uitnodigen lukte niet.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="rounded-card bg-surface p-6 shadow-card">
      <h2 className="text-lg font-bold">Iemand uitnodigen</h2>
      <p className="mt-1 text-sm text-ink-soft">
        Voor wie mee wil zorgen voor {personName}. De link werkt alleen voor het adres dat je hier
        invult.
      </p>

      <form onSubmit={maak} className="mt-4 space-y-3">
        <label className="block">
          <span className="text-sm font-semibold text-ink-soft">E-mailadres</span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 min-h-touch w-full rounded-2xl border-[1.5px] border-line-strong bg-surface px-4"
          />
        </label>

        <div className="flex flex-wrap gap-3">
          <label className="min-w-[min(10rem,100%)] flex-1">
            <span className="text-sm font-semibold text-ink-soft">Rol</span>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="mt-1 min-h-touch w-full rounded-2xl border-[1.5px] border-line-strong bg-surface px-4"
            >
              <option value="member">Familielid</option>
              <option value="admin">Familiebeheerder</option>
              <option value="caregiver">Zorgverlener</option>
              <option value="person">De persoon zelf</option>
            </select>
          </label>

          <label className="min-w-[min(10rem,100%)] flex-1">
            <span className="text-sm font-semibold text-ink-soft">Relatie</span>
            <input
              value={relation}
              onChange={(e) => setRelation(e.target.value)}
              placeholder="Zoon"
              className="mt-1 min-h-touch w-full rounded-2xl border-[1.5px] border-line-strong bg-surface px-4"
            />
          </label>
        </div>

        <button
          type="submit"
          disabled={busy}
          className="flex min-h-touch w-full items-center justify-center rounded-pill bg-accent-ink px-5 font-semibold text-white disabled:opacity-60"
        >
          {busy ? 'Bezig…' : 'Uitnodiging maken'}
        </button>
      </form>

      {link ? (
        <div className="mt-4 rounded-2xl border border-accent bg-accent-soft p-4">
          <p className="text-sm font-semibold">
            {verstuurd
              ? `Verstuurd naar ${email}. Of geef de link zelf door:`
              : `Klaar. Stuur deze link naar ${email}:`}
          </p>
          <p className="mt-2 break-all text-sm">{link}</p>
          <button
            onClick={() => {
              navigator.clipboard?.writeText(link).then(() => setCopied(true))
            }}
            className="mt-3 min-h-touch rounded-pill border-[1.5px] border-line-strong px-4 font-semibold"
          >
            {copied ? 'Gekopieerd' : 'Kopieer link'}
          </button>
          <p className="mt-2 text-xs text-ink-soft">Zeven dagen geldig, eenmalig te gebruiken.</p>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="mt-3 text-sm text-alert">
          {error}
        </p>
      ) : null}
    </section>
  )
}
