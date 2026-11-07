# Meu Bolso — finanças e agenda

App de controle financeiro (Pix, gastos por categoria, contas a pagar, plano de pagamento) e agenda
(dias de serviço, eventos, festas), com uma conta separada para cada pessoa.

| Parte | Onde fica |
|---|---|
| Site (`index.html`, ícones, `manifest.webmanifest`) | Arquivos estáticos — Cloudflare Pages (e GitHub Pages) |
| Login (e-mail e senha) | Supabase Auth, projeto `izpsmlbfponhqwzjodyf` |
| Dados | Supabase, esquema `meubolso` (tabela `docs`, uma linha por pessoa e por mês/lista) |

O banco fica fechado para o público: o site só fala com o Supabase pelas funções
`mb_pull`, `mb_push`, `mb_me`, `mb_admin_users` e `mb_admin_block`, que só entregam a cada pessoa
os dados dela. Administradores (tabela `meubolso.admins`) veem **quem** usa o app e podem bloquear
uma conta, mas não veem os gastos, contas ou agenda de ninguém.

A chave que aparece no `index.html` (`sb_publishable_...`) é pública por natureza; não coloque
chaves secretas nos arquivos do site.

## Publicar no Cloudflare Pages (igual ao site do lava jato)

1. Em <https://dash.cloudflare.com> vá em **Workers & Pages → Create → Pages → Connect to Git**.
2. Escolha o repositório **Raynan**.
3. **Project name:** `meu-bolso` (o endereço fica `https://meu-bolso.pages.dev`).
4. **Production branch:** `gh-pages`.
5. **Framework preset:** None · **Build command:** vazio · **Build output directory:** vazio (ou `/`).
6. **Save and Deploy**. Cada alteração enviada para a branch `gh-pages` publica sozinha.

Depois, no Supabase: **Authentication → URL Configuration**, coloque o endereço do site em
*Site URL* e em *Redirect URLs* (para o "Esqueci a senha" voltar para o app).

## Administradores

```sql
insert into meubolso.admins(email) values ('email@exemplo.com');   -- tornar admin
delete from meubolso.admins where email = 'email@exemplo.com';      -- tirar admin
```
