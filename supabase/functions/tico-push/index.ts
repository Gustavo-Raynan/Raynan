// Tico Finances — envia as notificações push agendadas (chamada pelo agendador a cada 5 minutos).
import webpush from "npm:web-push@3.6.7";
import postgres from "npm:postgres@3.4.4";

const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { prepare: false, max: 2 });
let cfg: Record<string, string> | null = null;

async function loadCfg() {
  if (cfg) return cfg;
  const rows = await sql`select name, value from meubolso.secrets`;
  cfg = Object.fromEntries(rows.map((r: any) => [r.name, r.value]));
  webpush.setVapidDetails("mailto:raynan344pa@gmail.com", cfg.vapid_public, cfg.vapid_private);
  return cfg;
}

Deno.serve(async (req) => {
  const c = await loadCfg();
  if (req.headers.get("x-cron-key") !== c.cron_key) return new Response("unauthorized", { status: 401 });
  // vencidas há mais de 12h não são mais enviadas
  await sql`update meubolso.push_queue set status='expired', updated_at=now()
            where status='pending' and send_at < now() - interval '12 hours'`;
  // pega o lote de uma vez (sem duas execuções enviarem a mesma)
  const due = await sql`
    with c as (
      select q.user_id, q.key from meubolso.push_queue q
      where q.status='pending' and q.send_at <= now()
        and exists(select 1 from meubolso.push_subs s where s.user_id=q.user_id)
        and not exists(select 1 from meubolso.blocked b where b.user_id=q.user_id)
      order by q.send_at limit 200 for update skip locked)
    update meubolso.push_queue q set status='sending', attempts=q.attempts+1, updated_at=now()
    from c where q.user_id=c.user_id and q.key=c.key
    returning q.*`;
  let sent = 0, failed = 0, removed = 0;
  for (const n of due) {
    const subs = await sql`select * from meubolso.push_subs where user_id=${n.user_id}`;
    const payload = JSON.stringify({ title: n.title, body: n.body || "", link: n.link || "", tag: n.key, cat: n.cat });
    let ok = false, err = "";
    for (const s of subs) {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 6 * 3600, urgency: "normal" });
        ok = true;
        await sql`update meubolso.push_subs set last_ok=now(), fails=0 where endpoint=${s.endpoint}`;
      } catch (e: any) {
        const code = e?.statusCode || 0;
        err = `${code} ${String(e?.body || e?.message || e).slice(0, 200)}`;
        if (code === 404 || code === 410) { await sql`delete from meubolso.push_subs where endpoint=${s.endpoint}`; removed++; }
        else await sql`update meubolso.push_subs set fails=fails+1 where endpoint=${s.endpoint}`;
      }
    }
    if (ok) { sent++; await sql`update meubolso.push_queue set status='sent', sent_at=now(), last_error=null where user_id=${n.user_id} and key=${n.key}`; }
    else {
      failed++;
      await sql`update meubolso.push_queue set status=${n.attempts >= 3 ? "failed" : "pending"}, last_error=${err || "sem aparelho"}
                where user_id=${n.user_id} and key=${n.key}`;
    }
  }
  return new Response(JSON.stringify({ due: due.length, sent, failed, removed }), { headers: { "Content-Type": "application/json" } });
});
