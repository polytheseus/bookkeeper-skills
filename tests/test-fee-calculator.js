// node tests/test-fee-calculator.js
var fc = require("../docs/guides/fee-calculator.js");
var pass = 0, fail = 0;
function eq(name, got, want) {
  if (JSON.stringify(got) === JSON.stringify(want)) pass++;
  else { fail++; console.log("FAIL " + name + "\n  got  " + JSON.stringify(got) + "\n  want " + JSON.stringify(want)); }
}
function ok(name, cond) { eq(name, !!cond, true); }

// Target rate: (36,000 + 4,000) / (46 × 37.5 × 65%) = 40,000 / 1,121.25 = 35.67 -> 36.
var tr = fc.targetRate({ income: "36,000", overheads: "£4,000", weeks: 46, hoursPerWeek: 37.5, billablePct: 65 });
eq("billable hours", tr.billableHours, 1121);
eq("rate", tr.rate, 35.67);
eq("rate rounded", tr.rateRounded, 36);
eq("no warnings", tr.warnings, []);
ok("warn >80%", fc.targetRate({ income: 30000, overheads: 3000, weeks: 46, hoursPerWeek: 37.5, billablePct: 90 }).warnings.join().indexOf("80%") >= 0);
ok("warn weeks", fc.targetRate({ income: 30000, overheads: 3000, weeks: 50, hoursPerWeek: 37.5, billablePct: 65 }).warnings.join().indexOf("48") >= 0);
ok("warn overheads 0", fc.targetRate({ income: 30000, overheads: 0, weeks: 46, hoursPerWeek: 37.5, billablePct: 65 }).warnings.join().indexOf("overheads") >= 0);
eq("zero hours", fc.targetRate({ income: 30000, overheads: 0, weeks: 0, hoursPerWeek: 37.5, billablePct: 65 }).rate, 0);
eq("weeks capped 52", fc.targetRate({ income: 52000, overheads: 0, weeks: 60, hoursPerWeek: 10, billablePct: 100 }).rate, 100);
eq("negative clamps", fc.targetRate({ income: -5, overheads: 1000, weeks: 10, hoursPerWeek: 10, billablePct: 100 }).rate, 10);

// Effective rate: £1,200 a year, 48 hours = £25/h vs target 36 = 69% -> well under; fee at target 36 × 48 = 1,728 -> 1,730.
var er = fc.effectiveRate(1200, 48, 36);
eq("eff rate", er.rate, 25);
eq("eff ratio", er.ratio, 69);
eq("eff verdict", er.verdict, "well under target");
eq("eff fee at target", er.feeAtTarget, 1730);
eq("eff at target", fc.effectiveRate(1800, 50, 36).verdict, "at or above target");
eq("eff little under", fc.effectiveRate(1600, 50, 36).verdict, "a little under target");
eq("eff under", fc.effectiveRate(1400, 50, 36).verdict, "under target");
eq("eff no hours", fc.effectiveRate(1200, 0, 36), null);

// Monthly fee, sole trader: 80 txns, 1 account, 15 bills, 10 invoices, no VAT, 20 min admin.
// 80 + 15 + 30 + 20 + 20 = 165 min; clean ×1; 10% -> 181.5 min = 3.025 h × 36 = 108.9 -> 110.
var m1 = fc.monthlyFee({ rate: 36, txns: 80, accounts: 1, bills: 15, invoices: 10, vat: "none", records: "clean", contingency: 10 });
eq("m1 base", m1.baseMins, 165);
eq("m1 mins", m1.mins, 182);
eq("m1 fee", m1.fee, 108.9);
eq("m1 rounded", m1.feeRounded, 110);
eq("m1 annual", m1.annual, 1320);
eq("m1 lines", m1.lines.length, 5);
eq("m1 no vat", m1.withVat, null);

// Company: 200 txns, 2 accounts, 40 bills, 20 invoices, quarterly VAT, monthly payroll 3 employees, CIS, report, average records, 10%.
// 200 + 30 + 80 + 40 + 20 + (20+15) + 20 + 30 + 20 = 475 min; ×1.15 ×1.1 = 600.875 min = 10.01 h × 36 = 360.53 -> 365.
var m2 = fc.monthlyFee({ rate: 36, txns: 200, accounts: 2, bills: 40, invoices: 20, vat: "quarterly", employees: 3, payroll: "monthly", cis: true, report: true, records: "average", contingency: 10, vatRegistered: true });
eq("m2 base", m2.baseMins, 475);
eq("m2 fee", m2.fee, 360.53);
eq("m2 rounded", m2.feeRounded, 365);
eq("m2 with vat", m2.withVat, 438);
ok("m2 vat warning", m2.warnings.join().indexOf("VAT registration") >= 0);
ok("m2 payroll line", m2.lines.some(function (l) { return l.task === "Payroll (monthly, 3 employees)" && l.mins === 35; }));
// Weekly payroll: 52/12 runs × (20 + 2×5) = 130 min.
var m3 = fc.monthlyFee({ rate: 36, txns: 0, accounts: 0, employees: 2, payroll: "weekly", admin: 0, contingency: 0 });
eq("m3 weekly payroll", m3.baseMins, 130);
// Monthly VAT and custom times.
var m4 = fc.monthlyFee({ rate: 60, txns: 100, accounts: 1, vat: "monthly", admin: 0, contingency: 0, times: { txn: 0.5, recon: 30 } });
eq("m4 base", m4.baseMins, 50 + 30 + 45);
eq("m4 fee", m4.feeRounded, 125);
ok("m4 warn rate 0", fc.monthlyFee({ rate: 0, txns: 10, accounts: 1 }).warnings.join().indexOf("hourly rate") >= 0);
ok("m4 warn no account", fc.monthlyFee({ rate: 30, txns: 10, accounts: 0 }).warnings.join().indexOf("bank accounts") >= 0);
eq("payroll none ignored", fc.monthlyFee({ rate: 30, employees: 4, payroll: "none", admin: 0 }).baseMins, 0);
eq("messy factor", fc.monthlyFee({ rate: 60, txns: 100, accounts: 0, admin: 0, records: "messy", contingency: 0 }).mins, 135);

// Catch-up: 6 months × 120 txns, 2 accounts, 2 VAT returns, some missing (40%).
// 720 + 180 + 120 + (60+60) = 1,140 min × 1.4 = 1,596 min = 26.6 h × 36 = 957.6 -> 975; deposit 50% = 487.5 -> 490.
var cu = fc.catchUp({ rate: 36, months: 6, txnsPerMonth: 120, accounts: 2, state: "some", vatReturns: 2, depositPct: 50, period: "April to September 2026" });
eq("cu base", cu.baseMins, 1140);
eq("cu cont", cu.contingency, 40);
eq("cu fee", cu.fee, 957.6);
eq("cu rounded", cu.feeRounded, 975);
eq("cu deposit", cu.deposit, 490);
ok("cu quote period", cu.quote.indexOf("Catch-up bookkeeping for April to September 2026: 2 bank and card accounts, about 720 transactions") === 0);
ok("cu quote fee", cu.quote.indexOf("Fixed fee: £975, with £490 (50%) paid before work starts") >= 0);
ok("cu quote assumption", cu.quote.indexOf("No more than about 792 transactions") >= 0);
ok("cu quote vat returns", cu.quote.indexOf("with 2 VAT returns prepared") >= 0);
ok("cu quote state", cu.quote.indexOf("- Bank statements are available but some receipts") >= 0);
eq("cu chaos default", fc.catchUp({ rate: 36, months: 3, txnsPerMonth: 50, accounts: 1, state: "chaos" }).contingency, 70);
eq("cu override cont", fc.catchUp({ rate: 36, months: 3, txnsPerMonth: 50, accounts: 1, state: "chaos", contingency: "30" }).contingency, 30);
ok("cu low cont warning", fc.catchUp({ rate: 36, months: 3, txnsPerMonth: 50, accounts: 1, contingency: 5 }).warnings.join().indexOf("15%") >= 0);
var cu2 = fc.catchUp({ rate: 50, months: 1, txnsPerMonth: 40, accounts: 1, state: "statements", depositPct: 0, currency: "$", vatRegistered: false });
ok("cu singular", cu2.quote.indexOf("for 1 month: 1 bank or card account, about 40 transactions") >= 0);
ok("cu no deposit text", cu2.quote.indexOf("paid before") < 0 && cu2.quote.indexOf("$") >= 0);
ok("cu plus vat", fc.catchUp({ rate: 36, months: 2, txnsPerMonth: 50, accounts: 1, vatRegistered: true }).quote.indexOf("plus VAT") >= 0);
ok("cu warn missing", fc.catchUp({ rate: 36, months: 0, txnsPerMonth: 50 }).warnings.length > 0);
ok("cu bad state", fc.catchUp({ rate: 36, months: 1, txnsPerMonth: 1, state: "zzz" }).contingency === 40);

// Price list: bands rise, add-ons positive, CSV well-formed.
var pl = fc.priceList({ rate: 36, contingency: 10, records: "average", report: true, admin: 20 });
eq("pl bands", pl.bands.map(function (b) { return b.name; }), ["Essentials", "Standard", "Plus"]);
ok("pl rising", pl.bands[0].fee < pl.bands[1].fee && pl.bands[1].fee < pl.bands[2].fee);
eq("pl from", pl.bands.map(function (b) { return b.from; }), [0, 51, 151]);
ok("pl addons", pl.addons.length === 7 && pl.addons.every(function (a) { return a.fee > 0 && a.fee % 5 === 0; }));
// Essentials: 50 + 15 + 20 + 10 + 30 + 20 = 145 × 1.15 × 1.1 = 183.4 min = 3.06 h × 36 = 110.06 -> 115.
eq("pl essentials", pl.bands[0].fee, 115);
// VAT add-on: 60 × 1.15 × 1.1 = 75.9 min × 36/60 = 45.54 -> 50.
eq("pl vat addon", pl.addons[0].fee, 50);
var rows = pl.csv.trim().split("\r\n");
eq("pl csv rows", rows.length, 11);
eq("pl csv head", rows[0], "Package or add-on,Includes,Price,Per");
ok("pl csv quoted", rows[1].indexOf('"Up to 50 transactions a month, 1 bank account, monthly report"') >= 0);
ok("pl text", pl.text.split("\n")[0] === "Essentials (Up to 50 transactions a month, 1 bank account, monthly report): £115 a month");
ok("pl vat note", fc.priceList({ rate: 36, vatRegistered: true }).csv.indexOf("(plus VAT)") >= 0);
ok("pl dollars", fc.priceList({ rate: 50, currency: "$" }).text.indexOf("$") >= 0);

// Helpers.
eq("roundUp exact", fc.roundUp(110, 5), 110);
eq("roundUp", fc.roundUp(110.01, 5), 115);
eq("money", fc.money(1320), "£1,320");
eq("money pence", fc.money(957.6, "$"), "$957.60");
eq("csv guard", fc.toCsv([["=SUM(A1)", "-486.00", "a\"b"]]), "'=SUM(A1),-486.00,\"a\"\"b\"\r\n");

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
