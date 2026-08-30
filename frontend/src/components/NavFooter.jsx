export default function NavFooter({ onSelect, disabled }) {
  return (
    <div className="nav-footer">
      <button className="nav-footer-btn" disabled={disabled} onClick={() => onSelect({ id: 'back', label: 'Topic Menu' })}>
        Topic Menu
      </button>
      <button className="nav-footer-btn" disabled={disabled} onClick={() => onSelect({ id: 'menu', label: 'Home' })}>
        Home
      </button>
    </div>
  );
}
