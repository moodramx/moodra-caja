import { useState } from 'react'
import { AmountKeypad } from '../../design/AmountKeypad'
import { BottomSheet } from '../../design/BottomSheet'
import { Button } from '../../design/Button'
import { Chip } from '../../design/Chip'
import { Card, Page } from '../../design/Page'
import { useToast } from '../../design/Toast'
import { entryToCents, formatMXN } from '../../lib/money'

const CATEGORIES = [
  { emoji: '⛽', label: 'Transporte' },
  { emoji: '🍔', label: 'Comida' },
  { emoji: '🏨', label: 'Hospedaje' },
  { emoji: '🎸', label: 'Equipo' },
]

/** Galería para probar el design system en el celular (Fase 0). */
export function ComponentesPage() {
  const { toast } = useToast()
  const [category, setCategory] = useState('Transporte')
  const [sheetOpen, setSheetOpen] = useState(false)
  const [amount, setAmount] = useState('')

  return (
    <Page number="00" title="Componentes">
      <Card className="space-y-3">
        <p className="text-ink-muted">Botones</p>
        <Button block>Principal</Button>
        <Button variant="secondary" block>
          Secundario
        </Button>
        <Button variant="ghost" block>
          Discreto
        </Button>
      </Card>

      <Card className="space-y-3">
        <p className="text-ink-muted">Chips</p>
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((item) => (
            <Chip
              key={item.label}
              emoji={item.emoji}
              selected={category === item.label}
              onClick={() => setCategory(item.label)}
            >
              {item.label}
            </Chip>
          ))}
        </div>
      </Card>

      <Card className="space-y-3">
        <p className="text-ink-muted">Hoja inferior + teclado de monto</p>
        <Button variant="secondary" block onClick={() => setSheetOpen(true)}>
          Abrir teclado
        </Button>
      </Card>

      <Card className="space-y-3">
        <p className="text-ink-muted">Avisos</p>
        <Button
          variant="secondary"
          block
          onClick={() =>
            toast({
              message: 'Guardado (de mentiritas).',
              actionLabel: 'Deshacer',
              onAction: () => toast({ message: 'Deshecho.' }),
            })
          }
        >
          Aviso con "Deshacer" (10 s)
        </Button>
      </Card>

      <BottomSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        title="¿Cuánto fue?"
        description="Solo es una prueba: no se guarda nada."
      >
        <AmountKeypad value={amount} onChange={setAmount} />
        <Button
          size="lg"
          block
          className="mt-4"
          disabled={entryToCents(amount) === 0n}
          onClick={() => {
            navigator.vibrate?.(20)
            setSheetOpen(false)
            toast({ message: `Tecleaste ${formatMXN(entryToCents(amount))}.` })
            setAmount('')
          }}
        >
          Listo
        </Button>
      </BottomSheet>
    </Page>
  )
}
