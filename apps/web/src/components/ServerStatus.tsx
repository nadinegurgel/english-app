import { useEffect, useState } from "react";
import { api } from "../api/client";

type State = "checking" | "online" | "offline";

const labels: Record<State, string> = {
  checking: "Verificando servidor…",
  online: "Servidor conectado",
  offline: "Servidor desconectado",
};

export function ServerStatus() {
  const [state, setState] = useState<State>("checking");

  useEffect(() => {
    api
      .health()
      .then((health) => setState(health.status === "ok" ? "online" : "offline"))
      .catch(() => setState("offline"));
  }, []);

  return (
    <p className={`server-status ${state}`}>
      <span className="dot" aria-hidden="true" />
      {labels[state]}
    </p>
  );
}
