export type HealthStatus = { status: "ok" | "error"; database: "up" | "down" };

export async function fetchHealth(): Promise<HealthStatus> {
  const response = await fetch("/api/health");
  return (await response.json()) as HealthStatus;
}
