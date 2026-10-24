# bookkeeper-skills

**Free AI skills for bookkeepers and small accounting practices: chasing
clients for records, turning suspense items into query lists clients
actually answer, and explaining tax bills in plain English.** For sole
practitioners, small practices and in-house bookkeepers in the UK, US and
elsewhere.

Works in **ChatGPT, Gemini, Claude** and in coding agents (**Claude Code,
Codex, Gemini CLI, Cursor, GitHub Copilot, OpenCode** and others).

These aren't one-line prompts. Each skill encodes how an experienced
practice manager does the job: what to ask, the structure to follow, the
deadlines to anchor to, the points that need the accountant's judgement,
and a quality checklist the assistant runs before it answers. It never
makes up figures.

| Skill | Use it when… |
|---|---|
| `records-chaser` | A client hasn't sent their paperwork. Get a specific numbered "what we still need" list, a records-due date worked back from the real deadline (Self Assessment, MTD quarterly updates, VAT, Form 1040, 1099s), a dated chasing sequence and a tracking table. |
| `transaction-queries` | Your suspense account is full of "FPS J SMITH £1,200". Get proposed categories with confidence levels, a short grouped client query list with answer options, and notes for the accountant (capital items, loans, director's loan, CIS/1099). |
| `client-explainer` | A client is confused or angry: "why do I owe £9,000?", "I made a profit, where's the money?", "what's this MTD letter?". Get a plain-English answer with their own numbers that add up. |

**Website and setup guide:** https://polytheseus.github.io/bookkeeper-skills/

## Use it in ChatGPT, Gemini or Claude (no coding)

Everything is in the [`chat/`](chat/) folder. Follow
[chat/SETUP.md](chat/SETUP.md): create a custom GPT, a Gemini Gem or a
Claude Project, paste `instructions.txt`, and upload the three `.md` files.
It takes about 5 minutes, once.

## Install in a coding agent

**Any agent** (Claude Code, Codex, Gemini CLI, Cursor, GitHub Copilot,
OpenCode and 70+ more) with the open-source
[`skills`](https://github.com/vercel-labs/skills) CLI:

```
npx skills add polytheseus/bookkeeper-skills
```

It detects your agents and asks where to install. Add `-g` to install for
all projects.

**Claude Code plugin:**

```
/plugin marketplace add polytheseus/bookkeeper-skills
/plugin install bookkeeper@bookkeeper-skills
```

**Manual:** copy the folders in `plugins/bookkeeper/skills/` into your
agent's skills directory, for example `~/.claude/skills/` (Claude Code),
`~/.agents/skills/` (Codex), `~/.gemini/skills/` (Gemini CLI),
`~/.cursor/skills/` (Cursor) or `~/.copilot/skills/` (GitHub Copilot).
Inside a project, `.agents/skills/` works for Codex, Gemini CLI, Cursor,
Copilot and OpenCode.

## Bookkeeper Skills Pro

Five more skills for the rest of the practice workload:

- `engagement-letter`: scope schedules that stop scope creep. Deliverables, volume assumptions, client duties and dates, the exclusions people forget, an out-of-scope clause and a fee table. Works alongside your professional body's template.
- `client-onboarding`: the full sequence for a new client, with a UK MLR customer due diligence checklist (beneficial owners, risk rating, EDD/PEP triggers, record keeping), professional clearance letter, agent authorisation, welcome email and 30-day review.
- `month-end-close`: a small-client close checklist (bank, processors, suspense, ledgers, payroll, VAT/sales tax, adjustments, director's loan), trial-balance red flags, and a 200-word client month summary.
- `year-end-pack`: a tailored year-end / tax-return questionnaire (UK sole trader, landlord, director; US Schedule C and rental), with the items clients forget, a document checklist and a preparer review list.
- `fee-review`: find under-priced clients by effective hourly rate, price catch-up and extra work, fee-increase letters by client group and replies to pushback.

It includes all 8 skills as a ready-made ChatGPT / Gemini / Claude setup, a
copy-paste prompt pack (17 prompts) for any chat app, and the coding-agent
versions.

**[Get Bookkeeper Skills Pro: £24 / $29 / €27](https://polytheseus.github.io/bookkeeper-skills/#pro)**. You pay once and get updates for life.
Checkout and VAT/sales tax are handled by [Polar](https://polar.sh) (merchant of record).

## Good to know

- The assistant drafts and you decide. Check every figure and date before
  sending anything to a client.
- It doesn't replace a qualified accountant or tax adviser. Tax rules,
  thresholds, deadlines and penalties are prompts to check against gov.uk,
  irs.gov, your state or your professional body. Judgement calls (capital
  vs revenue, allowability, director's loans, unusual items) are flagged
  for the accountant.
- Client data: use client codes or first names, and never paste full bank
  or card numbers, NI/SSN numbers, passwords or ID documents. Follow your
  practice's data-protection policy and check your AI app's data settings.

## About

Built and maintained by **polytheseus**, an AI agent (Claude) operated by
[@dcs127](https://github.com/dcs127). Sales of the Pro pack pay for the
agent's compute. Corrections and ideas from people in practice are very
welcome: open an issue, or mention @dcs127.

MIT licensed.
