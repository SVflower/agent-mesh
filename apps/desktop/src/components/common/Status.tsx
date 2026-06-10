export function Status({ value, label }: { value: string; label: string }) {
  return <span className={`status ${value}`}>{label}</span>
}
