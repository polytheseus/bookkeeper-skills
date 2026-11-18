---
name: transaction-queries
description: Turn uncategorised bank transactions, suspense-account items and "ask my accountant" lines into a short, grouped client query list that clients actually answer (with suggested answers to confirm), plus a proposed categorisation with confidence levels and bookkeeping rules for each answer. Use when a bookkeeper or accountant pastes bank lines, a suspense or uncategorised report, or a list of unknown transactions and wants to categorise them or ask the client about them.
---

# Transaction queries

Every bookkeeper has a suspense account full of lines like "FPS J SMITH
£1,200" or "AMZN MKTP £86.40". Sending the client a raw export of 60 lines
gets no reply. Guessing gets it wrong: personal spending booked as business
expenses, loans booked as sales, capital items expensed.

This skill does two jobs:

1. **Categorise what can be reasonably inferred**, with a confidence level,
   so the bookkeeper reviews instead of starting from scratch.
2. **Ask the client only what only the client knows**, in a format they can
   answer in five minutes from their phone.

You propose and the bookkeeper decides. Don't present a categorisation as
fact, and don't give tax advice on whether something is allowable beyond
flagging it for the accountant.

## Step 1: Get the input

Ask for (or accept as pasted):

- The transactions: date, description, amount, money in or out, account.
  Any export format is fine (CSV, copied from Xero/QuickBooks/FreeAgent/
  Sage, a PDF statement transcription).
- **The client's business** in one line (e.g. "mobile dog groomer, sole
  trader, VAT registered"), and whether the account is business-only or mixed.
- Their chart of accounts if it's not a standard one.
- Known patterns: regular suppliers, who the director is, family members
  paid, loans, other accounts they own.
- Country (UK/US/other) and VAT/sales-tax status.

Never ask for full card numbers or bank login details. Don't repeat full
account numbers back: use the last 4 digits.

## Step 2: Triage every line

Sort each line into one of four groups:

| Group | Meaning | Action |
|---|---|---|
| **A. Confident** | Clear supplier and purpose (e.g. "HMRC VAT", "Screwfix", the business's own payment processor payout) | Propose category; no question |
| **B. Likely** | Probably X but worth one tap to confirm (e.g. "AMZN MKTP £86.40": stock? office? personal?) | Propose category; yes/no question |
| **C. Unknown** | Only the client can say (e.g. "FPS J SMITH £1,200", cash withdrawals, round-sum transfers in) | Open question with options |
| **D. Flag** | Needs the accountant's judgement, not just the client's answer | Note for the accountant (see Step 4) |

**Common patterns and the right question:**

- **Money in that isn't obviously a sale** (transfers from a personal
  account, round amounts, from family): could be a loan, director's/owner's
  capital, a grant, a refund, or sales. Ask which; never assume it's income
  or that it isn't.
- **Payments to individuals**: wages (should be through payroll),
  subcontractor (UK CIS? US 1099?), loan repayment, personal, refund to a customer.
- **Cash withdrawals**: business expense paid in cash (receipt?), wages,
  drawings. Default for sole traders with no evidence is drawings, but ask.
- **Marketplaces** (Amazon, eBay, PayPal): ask what was bought; for PayPal
  and Stripe-type payouts, remember payouts are net of fees: gross sales
  and fees need splitting.
- **Large one-off purchases**: possibly a capital asset (equipment,
  vehicle, computer) rather than an expense. Flag for the accountant.
- **Supermarkets, restaurants, fuel**: mixed use is common. Ask the
  business share or whether it's personal.
- **Subscriptions** (software, phone): usually business, but phone and
  internet may be mixed use.
- **Transfers between the client's own accounts**: match both sides; not
  income or expense.
- **Refunds and chargebacks**: link to the original sale or purchase.
- **HMRC / IRS / state tax payments**: identify which tax (VAT, PAYE,
  Self Assessment, corporation tax, estimated tax). Personal tax paid from a
  company account is a director's loan item, not an expense: flag it.

## Step 3: Write the client query list

The format clients answer:

- **Grouped by question type, not by date.** "Payments to people",
  "Amazon orders", "Money paid in".
- **Each line**: date, amount, the description as it appears on their
  statement, and **answer options**: "Stock / Office supplies / Personal /
  Other: ___". For Group B lines, a pre-filled guess: "We think this is
  stock. Reply OK or correct it."
- **Number every line** so they can answer "1 OK, 2 personal, 3 van
  insurance".
- **Batch similar lines**: "These 9 Amazon orders: are any of them personal?"
- **Ask for evidence only where it matters**: big amounts, capital items,
  anything VAT-reclaimable without a VAT invoice.
- **Keep it short.** Put no more than 25 questions in one go; send the rest
  next week. Biggest amounts first.
- Opening line: why you're asking ("so your accounts and tax are right and
  you don't pay more tax than you need to") and a reply-by date.

Also produce a **one-message version** for WhatsApp/text when there are
fewer than 6 queries.

## Step 4: Notes for the accountant (Group D)

List anything that needs professional judgement, briefly, with the amount:

- Possible capital items (above the practice's capitalisation threshold).
- Loans in or out, director's loan account movements, owner capital.
- Personal tax paid from a business account.
- Payments to family members (are they on payroll and genuinely working?).
- Possible payments to subcontractors without CIS deductions (UK
  construction) or without a W-9/1099 (US).
- VAT-reclaim questions: no VAT invoice, mixed use, entertainment, or
  supplier not VAT-registered.
- Anything that looks unusual for the business (large cash deposits,
  payments to or from unrelated third parties, round-sum transfers from
  unknown sources). Stick to "this needs review": don't speculate or accuse.
  If it raises money-laundering concerns, the accountant or the practice's
  nominated officer must decide what to do. Never mention suspicions to the client.

## Step 5: The bookkeeping table

Give a table the bookkeeper can work from:

| # | Date | Description | Amount | In/Out | Proposed category | VAT/tax code | Confidence | Question? |
|---|---|---|---|---|---|---|---|---|

- Confidence: High / Medium / Low.
- VAT code only if the user gave their VAT status; otherwise "[check]".
- After the client replies, offer to update the table and suggest **bank
  rules** for recurring lines (e.g. "Description contains SCREWFIX →
  Materials, 20% VAT"), but warn against rules for mixed-use suppliers.

## Quality checklist (run before answering)

- [ ] Every line from the input appears once in the table (count them).
- [ ] Totals in and out match the input.
- [ ] No money-in line is assumed to be sales without evidence.
- [ ] Transfers between own accounts are matched, not double-counted.
- [ ] Client questions are grouped, numbered, have answer options, and are 25 or fewer.
- [ ] Group D notes are factual and non-accusatory; nothing about suspicions goes in the client message.
- [ ] No full account or card numbers are repeated.
- [ ] Categories use the client's chart of accounts when given.
- [ ] The answer ends with "Check before you post": low-confidence lines and accountant items.

## Example

Input (mixed-use sole trader account, UK, not VAT registered):

```
03/09 FPS J SMITH 1,200.00 OUT
05/09 AMZN MKTP UK*2K4 86.40 OUT
05/09 TESCO STORES 3301 42.17 OUT
08/09 TFR FROM M JONES 2,000.00 IN
12/09 ADOBE *CREATIVE CLD 56.98 OUT
```

Good output: Adobe → Software, High, no question. Tesco → ask "business
or personal?", with a pre-filled guess of personal. Amazon → Likely: "We
think this is equipment or supplies. What was it?" J Smith £1,200 → Unknown:
"Wages, subcontractor, loan repayment, personal or other?" with an
accountant note on payroll/CIS. M Jones £2,000 in → Unknown: "Is this a
sale, a loan, money you put in yourself, or other?", never booked as sales
by default. Then the table (5 lines; out £1,385.55; in £2,000.00) and a
short WhatsApp version.
