import type { RunDetail, RunSummary, Status } from "./types.ts";

async function get<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${path} -> ${res.status}`);
  return res.json() as Promise<T>;
}

export const api = {
  status: () => get<Status>("/api/status"),
  runs: () => get<RunSummary[]>("/api/runs"),
  run: (id: string) => get<RunDetail>(`/api/runs/${id}`),
  meshUrl: (id: string) => `/api/runs/${id}/mesh`,
};
