import { useId } from 'react'

export default function NumberField({ label, value, onChange, disabled = false, min, max, step = 'any', compact = false, hint }) {
  const id = useId()
  return (
    <div className={`studio-number-field ${compact ? 'studio-number-field--compact' : ''}`}>
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="number"
        inputMode="decimal"
        step={step}
        min={min}
        max={max}
        value={value ?? ''}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      />
      {hint && <small>{hint}</small>}
    </div>
  )
}
