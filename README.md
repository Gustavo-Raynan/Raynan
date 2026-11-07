# Tico Finances — finanças e agenda

App de controle financeiro (Pix, gastos por categoria, contas a pagar, plano de pagamento) e agenda
(dias de serviço, eventos, festas), com uma conta separada para cada pessoa.

| Parte | Onde fica |
|---|---|
| Site (`public/`: `index.html`, ícones, `manifest.webmanifest`) | Arquivos estáticos — Cloudflare Workers (e GitHub Pages) |
| Login (e-mail e senha) | Supabase Auth, projeto `izpsmlbfponhqwzjodyf` |
| Dados | Supabase, esquema `meubolso` (tabela `docs`, uma linha por pessoa e por mês/lista) |

O banco fica fechado para o público: o site só fala com o Supabase pelas funções
`mb_pull`, `mb_push`, `mb_me`, `mb_admin_users` e `mb_admin_block`, que só entregam a cada pessoa
os dados dela. Administradores (tabela `meubolso.admins`) veem **quem** usa o app e podem bloquear
uma conta, mas não veem os gastos, contas ou agenda de ninguém.

A chave que aparece no `index.html` (`sb_publishable_...`) é pública por natureza; não coloque
chaves secretas nos arquivos do site.

## Publicação no Cloudflare (Workers)

O projeto `tico-finances` no Cloudflare (**Workers & Pages**) está ligado a este repositório,
branch `main`, com o comando de deploy `npx wrangler deploy`. O `wrangler.jsonc` publica a pasta
`public/` (o site). Cada alteração enviada para a `main` publica sozinha.

A branch `gh-pages` tem a mesma cópia do site para o GitHub Pages
(`https://gustavo-raynan.github.io/Raynan/`).

Depois, no Supabase: **Authentication → URL Configuration**, coloque o endereço do site em
*Site URL* e em *Redirect URLs* (para o "Esqueci a senha" voltar para o app).

## Administradores

```sql
insert into meubolso.admins(email) values ('email@exemplo.com');   -- tornar admin
delete from meubolso.admins where email = 'email@exemplo.com';      -- tirar admin
```
