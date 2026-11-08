import { NavLink } from "react-router-dom";

const tabs = [
  { to: "/", label: "Hoje", icon: "☀︎" },
  { to: "/add", label: "Adicionar", icon: "+" },
  { to: "/words", label: "Palavras", icon: "☰" },
];

export function BottomNav() {
  return (
    <nav className="bottom-nav" aria-label="Navegação principal">
      {tabs.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end
          className={({ isActive }) => (isActive ? "nav-item active" : "nav-item")}
        >
          <span className="nav-icon" aria-hidden="true">
            {tab.icon}
          </span>
          <span>{tab.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
