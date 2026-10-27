// node tests/test-bank-rec.js
var br = require("../docs/guides/bank-rec.js");
var pass = 0, fail = 0;
function eq(name, got, want) {
  if (JSON.stringify(got) === JSON.stringify(want)) pass++;
  else { fail++; console.log("FAIL " + name + "\n  got  " + JSON.stringify(got) + "\n  want " + JSON.stringify(want)); }
}
function ok(name, cond) { eq(name, !!cond, true); }
function anyHas(list, s) { return list.some(function (x) { return x.indexOf(s) >= 0; }); }

// Amounts
eq("plain", br.parseAmount("250"), 25000);
eq("decimals", br.parseAmount("1,234.56"), 123456);
eq("pound", br.parseAmount("£1,234.56"), 123456);
eq("dollar neg", br.parseAmount("-$42.00"), -4200);
eq("neg after sym", br.parseAmount("$-42.00"), -4200);
eq("brackets", br.parseAmount("(250.00)"), -25000);
eq("DR", br.parseAmount("250.00 DR"), -25000);
eq("CR", br.parseAmount("250.00 CR"), 25000);
eq("one dp", br.parseAmount("2.5"), 250);
eq("float drift", br.parseAmount("0.29"), 29);
eq("bad commas", br.parseAmount("1,23.00"), null);
eq("words", br.parseAmount("abc"), null);
eq("empty", br.parseAmount(""), null);
eq("fmt", br.fmt(123456, "£"), "£1,234.56");
eq("fmt neg", br.fmt(-850, "$"), "-$8.50");
eq("fmt million", br.fmt(123456789, ""), "1,234,567.89");

// Dates
eq("iso", br.iso(br.parseDate("2026-10-14", "dmy", 2026)), "2026-10-14");
eq("uk dmy", br.iso(br.parseDate("14/10/2026", "dmy", 2026)), "2026-10-14");
eq("us mdy", br.iso(br.parseDate("10/14/2026", "mdy", 2026)), "2026-10-14");
eq("2-digit year", br.iso(br.parseDate("14/10/26", "dmy", 2026)), "2026-10-14");
eq("14 Oct", br.iso(br.parseDate("14 Oct", "dmy", 2026)), "2026-10-14");
eq("Oct 14, 2025", br.iso(br.parseDate("Oct 14, 2025", "mdy", 2026)), "2025-10-14");
eq("invalid day", br.parseDate("31/02/2026", "dmy", 2026), null);
eq("uk date as us invalid", br.parseDate("14/10/2026", "mdy", 2026), null);

// Lines
var p = br.parseLines("30/10/2026 | Paid in: Harper | 1,250.00\n\n27/10/2026\tCheque 412\t486.00\nInterest 2.75\n14 Oct Cheque 1043 Smith 250\nno amount here\n28/10/2026 Direct debit, phone -42.00\nRefund (12.50)", "dmy", 2026);
eq("lines count", p.items.length, 6);
eq("bad", p.bad, ["no amount here"]);
eq("pipe", [br.iso(p.items[0].date), p.items[0].desc, p.items[0].amount], ["2026-10-30", "Paid in: Harper", 125000]);
eq("tab", [br.iso(p.items[1].date), p.items[1].desc, p.items[1].amount], ["2026-10-27", "Cheque 412", 48600]);
eq("free no date", [p.items[2].date, p.items[2].desc, p.items[2].amount], [null, "Interest", 275]);
eq("free 14 Oct", [br.iso(p.items[3].date), p.items[3].desc, p.items[3].amount], ["2026-10-14", "Cheque 1043 Smith", 25000]);
eq("free dated neg", [br.iso(p.items[4].date), p.items[4].desc, p.items[4].amount], ["2026-10-28", "Direct debit, phone", -4200]);
eq("brackets line", p.items[5].amount, -1250);

// The page's worked example reconciles.
var ex = {
  country: "uk", account: "Business current account", date: "2026-10-31", bank: "4,812.40", books: "3,704.15",
  dit: "30/10/2026 | Paid in: Harper invoice 1187 | 1,250.00",
  out: "27/10/2026 | Cheque 000412 Ashdown Supplies | 486.00\n29/10/2026 | Faster Payment to J Mills (pending) | 1,920.00",
  bankOnly: "31/10/2026 | Monthly account fee | -8.50\n31/10/2026 | Interest | 2.75\n28/10/2026 | Direct debit: phone contract | -42.00"
};
var r = br.build(ex);
eq("ex ok", r.ok, true);
eq("ex adjBank", r.adjBank, 365640);
eq("ex adjBooks", r.adjBooks, 365640);
eq("ex reconciled", r.reconciled, true);
eq("ex no hints", r.hints, []);
eq("ex no warnings", r.warnings, []);
eq("ex toPost", r.toPost, 3);
ok("ex text reconciled", r.text.indexOf("Difference: 0.00. Reconciled.") >= 0);
ok("ex text uk words", r.text.indexOf("Uncleared lodgements") >= 0 && r.text.indexOf("Unpresented cheques") >= 0);
ok("ex text sym", r.text.indexOf("£3,656.40") >= 0);
ok("ex csv header", r.csv.indexOf("Section,Date,Description,Amount\r\n") === 0);
ok("ex csv negative unpresented", r.csv.indexOf("2026-10-27,Cheque 000412 Ashdown Supplies,-486.00") >= 0);
ok("ex csv no thousands comma", r.csv.indexOf("Adjusted bank balance,,,3656.40") >= 0);
ok("ex csv diff", /Unexplained difference,,,0\.00\r\n$/.test(r.csv));
ok("ex to do", r.text.indexOf("post the 3 statement-only items") >= 0);
// Bank-only split into in and out sections.
var inSec = r.sections.filter(function (s) { return /^Add: money in/.test(s.label); })[0];
var outSec = r.sections.filter(function (s) { return /^Less: money out/.test(s.label); })[0];
eq("in section", [inSec.items.length, inSec.total], [1, 275]);
eq("out section", [outSec.items.length, outSec.total], [2, -5050]);

// US wording and date order.
var us = br.build({ country: "us", date: "2026-10-31", bank: "1000", books: "900", dit: "10/30/2026 | Deposit | 100", out: "", bankOnly: "" });
eq("us diff", us.diff, 20000);
ok("us words", us.text.indexOf("Deposits in transit") >= 0 && us.text.indexOf("$") >= 0);
ok("us date parsed", us.text.indexOf("2026-10-30") >= 0);

// Differences and hints.
function d(bank, books, extra) { var o = { country: "uk", date: "2026-10-31", bank: bank, books: books, dit: "", out: "", bankOnly: "" }; for (var k in extra) o[k] = extra[k]; return br.build(o); }
var t9 = d("100.00", "64.00");  // 36.00 = 9 x 4.00
eq("t9 diff", t9.diff, 3600);
ok("t9 hint", anyHas(t9.hints, "divides exactly by 9"));
var dbl = d("500.00", "400.00", { out: "Cheque 9 | 50.00", bankOnly: "" });
// adjBank 450, books 400: diff 50 = item exactly.
ok("item exact", anyHas(dbl.hints, "An item is exactly £50.00: Cheque 9"));
var rev = d("500.00", "300.00", { dit: "Paid in X | 100.00" });
// adjBank 600, books 300 -> 300; no item 300, half = 150 no; not exact.
eq("rev diff", rev.diff, 30000);
ok("rev general half", anyHas(rev.hints, "£150.00 posted the wrong way round"));
ok("round hint", anyHas(rev.hints, "round difference"));
var half = d("500.00", "300.00", { dit: "Paid in X | 100.00", bankOnly: "Fee | -50.00" });
// adjBank 600, adjBooks 250 -> 350; no.
var h2 = d("1000.00", "1000.00", { out: "Cheque 7 | 60.00" });
// adjBank 940 vs 1000 -> -60 exact item
ok("negative diff exact item", anyHas(h2.hints, "exactly £60.00"));
var h3 = d("1000.00", "1000.00", { out: "Cheque 7 | 30.00", dit: "x | 0" });
eq("h3 diff", h3.diff, -3000);
var h4 = d("1000.00", "1090.00", { bankOnly: "Fee | -30.00" });
// adjBooks 1060; diff -60 = 2 x 30 -> sign reversed hint naming Fee
ok("half matches item", anyHas(h4.hints, "same as Fee"));
ok("reconciled no hints", d("10", "10").hints.length === 0);

// Errors
var e1 = br.build({ country: "uk", bank: "", books: "10" });
eq("missing bank", e1.ok, false);
ok("missing bank msg", anyHas(e1.errors, "closing balance on the bank statement"));
var e2 = br.build({ country: "uk", bank: "10", books: "10", dit: "just words" });
ok("bad line msg", anyHas(e2.errors, "Couldn't find an amount") && anyHas(e2.errors, "just words"));
var od = br.build({ country: "uk", bank: "-250.00", books: "(250.00)" });
eq("overdraft both", [od.ok, od.reconciled], [true, true]);
var odDR = br.build({ country: "uk", bank: "250.00 DR", books: "-250" });
eq("overdraft DR", odDR.reconciled, true);

// Warnings
var w = d("1000", "1000", {
  dit: "01/10/2026 | Old lodgement | 50\n05/11/2026 | Future | 10",
  out: "01/03/2026 | Ancient cheque | 20\n15/08/2026 | Summer cheque | 30\nTyped negative | -5"
});
ok("stale deposit", anyHas(w.warnings, "Old lodgement\" was paid in 30 days"));
ok("future", anyHas(w.warnings, "Future\" is dated 2026-11-05, after"));
ok("6 months uk", anyHas(w.warnings, "Ancient cheque\" has been outstanding for over 6 months") && !anyHas(w.warnings, "UCC"));
ok("60 days", anyHas(w.warnings, "Summer cheque\" has been outstanding for 77 days"));
ok("negative on list", anyHas(w.warnings, "entered as a negative"));
eq("negative used as positive", w.sections[2].total, -5500);
var wus = br.build({ country: "us", date: "2026-10-31", bank: "1", books: "1", out: "03/01/2026 | Old check | 20" });
ok("6 months us UCC", anyHas(wus.warnings, "UCC § 4-404"));
var nodate = br.build({ country: "uk", bank: "1", books: "1", out: "01/03/2026 | Old cheque | 20" });
ok("no rec date warning", anyHas(nodate.warnings, "Add the reconciliation date"));

// CSV safety: formula-looking descriptions are neutralised.
var inj = d("10", "10", { bankOnly: "=HYPERLINK(\"x\") | 0" });
ok("csv injection", inj.csv.indexOf("'=HYPERLINK") >= 0);
// Exact pence sums
var cents = d("0.30", "0.10", { dit: "a | 0.10\nb | 0.20", out: "c | 0.20\nd | 0.10" });
eq("pence exact", cents.diff, 2000 / 100);

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
