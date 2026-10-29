export default function DetailTabs<T extends string>({ label, value, onChange, options }: {
  label: string; value: T; onChange: (value: T) => void; options: { value: T; label: string; count?: number }[];
}) {
  return <div className="detail-tabs" role="group" aria-label={label}>
    {options.map(option => <button key={option.value} aria-pressed={value === option.value} onClick={() => onChange(option.value)} className={value === option.value ? 'selected' : ''}>
      {option.label}{option.count !== undefined && <span>{option.count.toLocaleString()}</span>}
    </button>)}
  </div>;
}
