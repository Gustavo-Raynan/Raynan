// Tico Finances — Open Finance via Pluggy (MeuPluggy). Só lê dados: nunca move dinheiro.
import postgres from "npm:postgres@3.4.4";

const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { prepare: false, max: 2 });
const SB_URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const API = "https://api.pluggy.ai";
function cors(req: Request) {
  return {
    "Access-Control-Allow-Origin": req.headers.get("origin") || "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}
const J = (req: Request, body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors(req), "content-type": "application/json" } });

async function userOf(req: Request): Promise<string | null> {
  const auth = req.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ")) return null;
  const r = await fetch(`${SB_URL}/auth/v1/user`, { headers: { authorization: auth, apikey: ANON } });
  if (!r.ok) return null;
  const u = await r.json();
  if (!u?.id) return null;
  const b = await sql`select 1 from meubolso.blocked where user_id=${u.id}`;
  return b.length ? null : u.id;
}

async function apiKey(cid: string, sec: string) {
  const r = await fetch(`${API}/auth`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ clientId: cid, clientSecret: sec }) });
  if (!r.ok) throw new Error(r.status === 401 || r.status === 403 ? "Client ID ou Client Secret da Pluggy inválidos." : `Pluggy recusou o acesso (${r.status}).`);
  return (await r.json()).apiKey as string;
}
async function pg(key: string, path: string, init: RequestInit = {}) {
  const r = await fetch(`${API}${path}`, { ...init, headers: { "X-API-KEY": key, "content-type": "application/json", ...(init.headers || {}) } });
  if (!r.ok) { const t = await r.text(); throw new Error(`Pluggy ${path.split("?")[0]}: ${r.status} ${t.slice(0, 160)}`); }
  return r.json();
}

const ymd = (d: Date) => d.toISOString().slice(0, 10);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  try {
    const uid = await userOf(req);
    if (!uid) return J(req, { error: "Sessão expirada. Entre de novo." }, 401);
    const body = await req.json().catch(() => ({}));
    const act = String(body.action || "");
    const rows = await sql`select client_id, client_secret, items from meubolso.bank_links where user_id=${uid}`;
    if (!rows.length) return J(req, { error: "Cole primeiro os códigos da Pluggy." }, 400);
    const L = rows[0];
    let items: any[] = Array.isArray(L.items) ? L.items : [];
    const key = await apiKey(L.client_id, L.client_secret);

    if (act === "check") return J(req, { ok: true });

    if (act === "token") {
      const p: any = {};
      if (body.itemId) p.itemId = String(body.itemId);
      const t = await pg(key, "/connect_token", { method: "POST", body: JSON.stringify(p) });
      return J(req, { token: t.accessToken });
    }

    if (act === "add") {
      const id = String(body.itemId || "");
      if (!/^[0-9a-f-]{20,60}$/i.test(id)) return J(req, { error: "Conexão inválida." }, 400);
      const it = await pg(key, `/items/${id}`);
      items = items.filter((x) => x.id !== id).concat([{ id, name: it.connector?.name || "Banco", added: new Date().toISOString() }]);
      await sql`update meubolso.bank_links set items=${sql.json(items)}, updated_at=now() where user_id=${uid}`;
      return J(req, { ok: true, items });
    }

    if (act === "remove") {
      const id = String(body.itemId || "");
      items = items.filter((x) => x.id !== id);
      await sql`update meubolso.bank_links set items=${sql.json(items)}, updated_at=now() where user_id=${uid}`;
      return J(req, { ok: true, items });
    }

    if (act === "sync") {
      const since: Record<string, string> = body.since || {};
      const out: any[] = [];
      const errs: string[] = [];
      for (const it of items) {
        try {
          const item = await pg(key, `/items/${it.id}`);
          const accs = (await pg(key, `/accounts?itemId=${it.id}`)).results || [];
          for (const a of accs) {
            const def = ymd(new Date(Date.now() - 30 * 864e5));
            let from = String(since[a.id] || def);
            if (!/^\d{4}-\d{2}-\d{2}$/.test(from)) from = def;
            const tx: any[] = [];
            for (let page = 1; page <= 10; page++) {
              const r = await pg(key, `/transactions?accountId=${a.id}&from=${from}&to=${ymd(new Date(Date.now() + 864e5))}&pageSize=500&page=${page}`);
              for (const t of r.results || []) {
                tx.push({
                  id: t.id, date: String(t.date).slice(0, 10), amount: Math.abs(Number(t.amount) || 0),
                  type: t.type === "CREDIT" ? "entrada" : "saida",
                  desc: String(t.descriptionRaw || t.description || "").slice(0, 140),
                  cat: t.category || "", status: t.status || "",
                  pay: t.paymentData ? { method: t.paymentData.paymentMethod || "", payer: t.paymentData.payer?.name || "", receiver: t.paymentData.receiver?.name || "" } : null,
                });
              }
              if (!r.totalPages || page >= r.totalPages) break;
            }
            out.push({
              itemId: it.id, connector: item.connector?.name || it.name, status: item.status, updatedAt: item.lastUpdatedAt,
              account: { id: a.id, type: a.type, subtype: a.subtype, name: a.marketingName || a.name, number: a.number, balance: a.balance, currency: a.currencyCode,
                         credit: a.creditData ? { limit: a.creditData.creditLimit, available: a.creditData.availableCreditLimit, due: a.creditData.balanceDueDate, close: a.creditData.balanceCloseDate } : null },
              from, tx,
            });
          }
        } catch (e) { errs.push(`${it.name}: ${(e as Error).message}`); }
      }
      await sql`update meubolso.bank_links set last_sync=now(), last_error=${errs.length ? errs.join(" | ").slice(0, 500) : null} where user_id=${uid}`;
      return J(req, { ok: true, accounts: out, errors: errs });
    }
    return J(req, { error: "ação desconhecida" }, 400);
  } catch (e) {
    return J(req, { error: (e as Error).message || "erro" }, 500);
  }
});
