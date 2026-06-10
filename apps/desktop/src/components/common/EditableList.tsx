export function EditableList({
  label,
  onChange,
  placeholder,
  rows = 4,
  value,
}: {
  label: string
  onChange: (value: string) => void
  placeholder?: string
  rows?: number
  value: string
}) {
  return (
    <label>
      <span>{label}</span>
      <textarea
        rows={rows}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
    </label>
  )
}
