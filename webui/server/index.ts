/**
 * Local API for the figurine factory UI.
 *
 * Binds to 127.0.0.1 only. This machine holds the photos and the meshes; nothing here
 * should be reachable from the network.
 */
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { DB_PATH, getRun, listRuns, openDb } from "./db.ts";

const PORT = Number(process.env.FIGURINE_PORT ?? 8757);
const HOST = process.env.FIGURINE_HOST ?? "127.0.0.1";
const DIST = join(import.meta.dir, "../dist");

const db = openDb();

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });

/** Serve the built SPA when it exists, so `bun run build && bun run dev` is one origin. */
async function serveStatic(pathname: string): Promise<Response | null> {
  if (!existsSync(DIST)) return null;
  const candidate = join(DIST, pathname === "/" ? "index.html" : pathname);
  if (candidate.startsWith(DIST) && existsSync(candidate) && statSync(candidate).isFile()) {
    return new Response(Bun.file(candidate));
  }
  const index = join(DIST, "index.html");
  return existsSync(index) ? new Response(Bun.file(index)) : null;
}

const server = Bun.serve({
  port: PORT,
  hostname: HOST,

  routes: {
    "/api/status": () => {
      const seeded = db
        .query<{ n: number }, []>("SELECT COUNT(*) AS n FROM runs WHERE manifest_json LIKE '%\"seeded\":true%'")
        .get();
      const total = db.query<{ n: number }, []>("SELECT COUNT(*) AS n FROM runs").get();
      return json({
        db: DB_PATH,
        runs: total?.n ?? 0,
        // Mock until real runs are published with `figurine publish`. The UI says so
        // rather than letting sample data pass for the real thing.
        mock: (seeded?.n ?? 0) > 0 && seeded?.n === total?.n,
      });
    },

    "/api/runs": {
      GET: () => json(listRuns(db)),
      // Starting a run needs the generate stage, which is blocked on the TRELLIS.2
      // environment. Say so plainly rather than queueing a job that never runs.
      POST: () =>
        json(
          {
            error: "not_implemented",
            message:
              "Starting a run from the UI needs the generate stage, which is blocked on the TRELLIS.2 environment. Use `figurine repair <mesh>` meanwhile, then `figurine publish out/<run_id>`.",
          },
          501,
        ),
    },

    "/api/runs/:id": (req) => {
      const run = getRun(db, req.params.id);
      return run ? json(run) : json({ error: "not_found" }, 404);
    },

    "/api/runs/:id/mesh": (req) => {
      const run = getRun(db, req.params.id);
      if (!run?.mesh_path || !existsSync(run.mesh_path)) {
        return json({ error: "no_mesh", message: "this run produced no mesh" }, 404);
      }
      return new Response(Bun.file(run.mesh_path), {
        headers: {
          "content-type": "model/stl",
          "content-disposition": `inline; filename="${run.run_id}.stl"`,
        },
      });
    },
  },

  async fetch(req) {
    const { pathname } = new URL(req.url);
    if (pathname.startsWith("/api/")) return json({ error: "not_found" }, 404);
    return (await serveStatic(pathname)) ?? new Response("Not found", { status: 404 });
  },
});

console.log(`figurine api  http://${server.hostname}:${server.port}  db: ${DB_PATH}`);
if (!existsSync(DIST)) {
  console.log("ui (dev)      http://127.0.0.1:5173   — run `bun run ui` in another shell");
}
