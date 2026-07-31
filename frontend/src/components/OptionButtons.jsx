export default function OptionButtons({ options, onSelect, disabled }) {
  if (!options.length) return null;
  return (
    <div className="option-buttons">
      {options.map((option) => (
        <button key={option.id} disabled={disabled} onClick={() => onSelect(option)}>
          {option.label}
        </button>
      ))}
    </div>
  );
}
