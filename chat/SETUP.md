# Set up Bookkeeping Assistant in ChatGPT, Gemini or Claude

No coding needed. Setup takes about 5 minutes, once. You then have a helper that
chases clients for records, turns suspense items into query lists and explains
tax bills in plain English, the way an experienced practice manager would.

**You need these four files from this folder:**
`instructions.txt`, `records-chaser.md`, `transaction-queries.md` and `client-explainer.md`.
To download them, open each file on GitHub and click the download button
(the arrow icon, top right of the file). Or download the whole pack as a zip:
green **Code** button → **Download ZIP**, then unzip it and open the `chat` folder.

---

## ChatGPT (custom GPT)

Creating a GPT needs a paid ChatGPT plan. On a free plan, use the
"ChatGPT Project" or "Any chat" options below instead.

1. Go to chatgpt.com and click **GPTs** in the left sidebar, then **+ Create**.
2. Click the **Configure** tab (not "Create").
3. **Name**: `Bookkeeping Assistant`. **Description**: `Records chasing, transaction queries and client explanations`.
4. Open `instructions.txt`, copy everything, and paste it into **Instructions**.
5. Under **Knowledge**, click **Upload files** and add the three `.md` files.
6. Click **Create** (top right) and choose **Only me**. Done: it appears in
   your sidebar.

**ChatGPT Project (works on more plans):** in the sidebar click **New project**,
name it `Bookkeeping Assistant`, open the project's **Instructions** and paste
`instructions.txt`, then add the three `.md` files under **Files**. Start
every chat inside that project.

## Gemini (Gem)

1. Go to gemini.google.com. In the left menu, open **Gems** (you may need
   **Explore Gems**), then **New Gem**.
2. **Name**: `Bookkeeping Assistant`.
3. Paste everything from `instructions.txt` into **Instructions**.
4. Under **Knowledge**, add the three `.md` files.
5. Click **Save**. Find it later under Gems in the left menu.

## Claude (Project)

1. Go to claude.ai and click **Projects**, then **Create project**. Name it
   `Bookkeeping Assistant`.
2. Click **Set project instructions** (or the instructions pencil), paste
   `instructions.txt`, and save.
3. Under **Project knowledge**, click **+** and upload the three `.md` files.
4. Start every chat inside the project.

## Any chat, any app (no setup)

Start a new chat, paste the contents of `instructions.txt`, then paste the
matching `.md` file (for example `records-chaser.md`) and finish with your
request. This works in any AI chat app, including free plans. It's just a
little more pasting each time.

---

## Try it

- "Sole trader, electrician, 2025-26 tax return due 31 Jan. Missing: Amex statements since June, 9 Screwfix payments with no receipts, mileage. Asked once on 2 Oct, no reply. Draft the request and a chasing plan."
- "Here are 40 uncategorised bank lines for a mobile dog groomer (not VAT registered). Categorise what you can and write a client query list." (paste the lines, with only the last 4 digits of account numbers)
- "Client is angry that HMRC wants £9,000 in January when last year's bill was £6,000. Explain payments on account to her with her numbers."

**Privacy tips:** use client codes or first names, and never paste full bank
or card numbers, NI/SSN numbers, passwords or ID documents. Check your
practice's data-protection policy and your AI app's data settings (for
example, turn off "improve the model for everyone" in ChatGPT, or use a
business/team plan that doesn't train on your data).

**Always check** figures, dates and rules before sending. Tax points are
prompts to check gov.uk, irs.gov or your professional body, not advice.

If a menu name has changed since this guide was written, the apps' help
pages show the current steps: search "create a GPT", "create a Gem" or
"Claude projects".
