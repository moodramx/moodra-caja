// Saldos de la banda: quién trae efectivo, a quién se le debe, y regresar dinero.
import { useState } from 'react'
import { BottomSheet } from '../../design/BottomSheet'
import { Button } from '../../design/Button'
import { Card, Page } from '../../design/Page'
import { useAuth } from '../../lib/auth'
import type { MemberBalance, MoneyPlace, RegresoPayload } from '../../lib/events'
import { describeRegreso } from '../../lib/humanize'
import { entryToCents, formatMXNShort } from '../../lib/money'
import { useBalances, useCashPosition } from '../../lib/queries'
import { AmountStep, Confirm, Option, Step, useCapture } from '../captura/parts'
import { PorCobrar } from '../shows/ShowsExtras'

const money = (cents: bigint | number | null) => formatMXNShort(BigInt(cents ?? 0))

type StepName = 'monto' | 'origen' | 'confirmar'

/** Regresar dinero: cuánto → de dónde sale → confirmar. */
function RegresoFlow({ member, onDone }: { member: MemberBalance; onDone: () => void }) {
  const { profile } = useAuth()
  const capture = useCapture()
  const [step, setStep] = useState<StepName>('monto')
  const [amount, setAmount] = useState('')
  const [origin, setOrigin] = useState<MoneyPlace | null>(null)

  const owed = BigInt(member.owed_cents ?? 0)
  const isSelf = member.member_id === profile?.id
  const isContador = profile?.role === 'contador'
  const name = member.display_name ?? 'Alguien'
  const tooMuch = entryToCents(amount) > owed

  if (step === 'monto') {
    return (
      <Step question={isSelf ? '¿Cuánto te regresaste?' : `¿Cuánto le regresaste a ${name}?`}>
        <p className="text-ink-muted">
          {isSelf ? 'Te debemos' : 'Le debemos'} {money(owed)}.{' '}
          <button
            type="button"
            className="min-h-12 font-semibold text-accent underline underline-offset-4"
            onClick={() => setAmount((Number(owed) / 100).toString())}
          >
            Poner todo
          </button>
        </p>
        <AmountStep
          value={amount}
          onChange={setAmount}
          onNext={() => !tooMuch && setStep('origen')}
        />
        {tooMuch && (
          <p role="alert" className="text-danger">
            Es más de lo que se le debe ({money(owed)}).
          </p>
        )}
      </Step>
    )
  }

  if (step === 'origen') {
    const choose = (next: MoneyPlace) => {
      setOrigin(next)
      setStep('confirmar')
    }
    return (
      <Step question="¿De dónde salió el dinero?" onBack={() => setStep('monto')}>
        <div className="space-y-2">
          <Option
            emoji="💵"
            label="Del efectivo de la banda que traigo"
            onClick={() => choose('efectivo_integrante')}
          />
          {isContador && (
            <>
              <Option
                emoji="🏦"
                label="De la cuenta de la banda"
                onClick={() => choose('cuenta_banda')}
              />
              <Option emoji="🧰" label="De la caja" onClick={() => choose('caja')} />
            </>
          )}
        </div>
        {!isContador && (
          <p className="text-sm text-ink-muted">
            Si se pagó desde la cuenta o la caja, lo registra Diego.
          </p>
        )}
      </Step>
    )
  }

  if (!origin || !member.member_id) return null
  const payload: RegresoPayload = {
    amount_cents: Number(entryToCents(amount)),
    member_id: member.member_id,
    origin,
  }

  return (
    <Step question="¿Así quedó?" onBack={() => setStep('origen')}>
      <Confirm
        text={describeRegreso(payload, name, owed, isSelf)}
        onSave={() => {
          void capture('regreso_dinero', payload)
          onDone()
        }}
      />
    </Step>
  )
}

export function SaldosPage() {
  const balances = useBalances()
  const cash = useCashPosition()
  const [paying, setPaying] = useState<MemberBalance | null>(null)

  const place = (kind: string) => cash.data?.find((row) => row.kind === kind)?.balance_cents ?? 0
  const members = (balances.data ?? []).filter(
    (m) => m.activo || BigInt(m.cash_cents ?? 0) !== 0n || BigInt(m.owed_cents ?? 0) !== 0n,
  )

  return (
    <Page number="07" title="Saldos de la banda">
      <Card>
        <p className="text-ink-muted">Dinero de la banda</p>
        <div className="mt-2 grid grid-cols-2 gap-3">
          <p>
            <span className="block text-sm text-ink-muted">🏦 En la cuenta</span>
            <span className="display text-3xl tabular-nums">{money(place('banco'))}</span>
          </p>
          <p>
            <span className="block text-sm text-ink-muted">🧰 En la caja</span>
            <span className="display text-3xl tabular-nums">{money(place('caja'))}</span>
          </p>
        </div>
      </Card>

      <PorCobrar />

      {balances.isPending && <p className="text-ink-muted">Afinando…</p>}

      {members.map((member) => {
        const owed = BigInt(member.owed_cents ?? 0)
        const held = BigInt(member.cash_cents ?? 0)
        return (
          <Card key={member.member_id}>
            <p className="text-lg font-semibold">
              <span aria-hidden="true">{member.emoji}</span> {member.display_name}
            </p>
            <p className="mt-1">
              Trae <strong>{money(held < 0n ? 0n : held)}</strong> de la banda
              {held < 0n && <span className="text-pending"> (gastó {money(-held)} de más)</span>}
            </p>
            {owed > 0n ? (
              <>
                <p>
                  Le debemos <strong className="text-in">{money(owed)}</strong>
                </p>
                <Button
                  variant="secondary"
                  block
                  className="mt-3"
                  onClick={() => setPaying(member)}
                >
                  ↩️ Regresarle dinero
                </Button>
              </>
            ) : (
              <p className="text-ink-muted">No se le debe nada.</p>
            )}
          </Card>
        )
      })}

      <BottomSheet
        open={paying !== null}
        onOpenChange={(open) => !open && setPaying(null)}
        title="↩️ Regresar dinero"
      >
        {paying && <RegresoFlow member={paying} onDone={() => setPaying(null)} />}
      </BottomSheet>
    </Page>
  )
}
