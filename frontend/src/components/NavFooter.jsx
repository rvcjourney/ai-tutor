export default function NavFooter({ onSelect, disabled }) {
  return (
    <div className="nav-footer">
      <button
        className="nav-footer-btn"
        disabled={disabled}
        onClick={() => onSelect({ id: 'back', label: 'Back to Topic Menu' })}
      >
        Back to Topic Menu
      </button>
      <button className="nav-footer-btn" disabled={disabled} onClick={() => onSelect({ id: 'menu', label: 'Main Menu' })}>
        Main Menu
      </button>
    </div>
  );
}
