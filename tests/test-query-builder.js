// node tests/test-query-builder.js
var qb = require("../docs/guides/query-builder.js");
var pass = 0, fail = 0;
function eq(name, got, want) {
  if (JSON.stringify(got) === JSON.stringify(want)) pass++;
  else { fail++; console.log("FAIL " + name + "\n  got  " + JSON.stringify(got) + "\n  want " + JSON.stringify(want)); }
}
function groups(r) { return r.items.map(function (it) { return it.c.group; }).join(""); }

// The transaction-queries skill's own example (UK sole trader, not VAT registered).
var skill = "03/09 FPS J SMITH 1,200.00 OUT\n05/09 AMZN MKTP UK*2K4 86.40 OUT\n05/09 TESCO STORES 3301 42.17 OUT\n08/09 TFR FROM M JONES 2,000.00 IN\n12/09 ADOBE *CREATIVE CLD 56.98 OUT";
var r = qb.build(skill, { country: "uk", entity: "sole", capital: 1000 });
eq("skill count", r.items.length, 5);
eq("skill totals", r.totals, { in: 2000, out: 1385.55 });
eq("skill groups", groups(r), "DBBDA");
eq("adobe no question", r.items[4].c.question, "");
eq("tesco guess", r.items[2].c.guess, "personal");
eq("money in never sales", /not sales/.test(r.items[3].c.category), true);
eq("questions", r.questions, 4);
eq("whatsapp under 6", r.whatsapp.length > 0, true);
eq("biggest first", r.message.indexOf("2,000.00") < r.message.indexOf("1,200.00"), true);
eq("cis note", /CIS/.test(r.notes[0]), true);
eq("no accountant notes in client message", /CIS|director|loan account|review/i.test(r.message), false);

// Signed CSV export: a minus sign means money out, so unsigned lines are money in.
var csv = '2026-09-01,STRIPE PAYOUT,412.10\n2026-09-02,HMRC NDDS,-1500.00\n2026-09-03,"AMAZON.CO.UK, MKTP",-12.99\n2026-09-04,AMZN MKTP,-8.50\n2026-09-05,AMZN MKTP,-8.99\n2026-09-06,CASH ATM 1234567890123456,-200\n2026-09-07,BARCLAYS ACCOUNT FEE,-8.50\n2026-09-08,CLIENT ABC LTD,"3,250.00"\nnot a line';
r = qb.build(csv, { country: "uk", entity: "company", vat: true });
eq("csv count", r.items.length, 8);
eq("csv skipped", r.skipped, ["not a line"]);
eq("csv dirs", r.items.map(function (it) { return it.dir; }).join(","), "in,out,out,out,out,out,out,in");
eq("quoted thousands", r.items[7].amount, 3250);
eq("stripe payout is sales", r.items[0].c.group + r.items[0].c.confidence, "AHigh");
eq("company personal tax flagged", r.items[1].c.group, "D");
eq("card number masked", r.items[5].desc, "CASH ATM ****3456");
eq("bank fee confident", r.items[6].c.group, "A");
eq("big money in to accountant", r.items[7].c.group, "D");
eq("amazon batched", /These 3 payments look like business supplies/.test(r.message), true);
eq("vat note", r.notes.some(function (n) { return /VAT invoice/.test(n); }), true);
eq("no long numbers anywhere", /\d{8,}/.test(JSON.stringify(r)), false);

// US: payments to a person mention the 2026 $2,000 1099-NEC threshold.
r = qb.build("01/15/2026 ZELLE TO MARIA GARCIA 2500.00 OUT\n01/16/2026 IRS USATAXPYMT 3000.00 OUT\n01/17/2026 HOME DEPOT 1450.00 OUT", { country: "us", entity: "sole", capital: 2500 });
eq("us groups", groups(r), "DBB");
eq("us 1099", /\$2,000 or more in 2026/.test(r.notes[0]), true);
eq("us dollars", /\$2,500\.00/.test(r.message), true);
eq("trade under threshold stays materials", r.items[2].c.category, "Materials");

// Unsigned paste with no IN/OUT words follows the setting.
eq("unsigned default out", qb.parseLines("SCREWFIX 45.00").rows[0].dir, "out");
eq("unsigned in", qb.parseLines("SCREWFIX 45.00", "in").rows[0].dir, "in");
eq("date formats", qb.parseLines("12 Sep 2026 SCREWFIX 45.00 DR\n2026-09-12 TOOLSTATION £9.99 CR").rows.map(function (x) { return x.date + "|" + x.dir; }), ["12 Sep 2026|out", "2026-09-12|in"]);

// More than 25 questions: the smallest go in the next batch.
var many = [];
for (var i = 1; i <= 30; i++) many.push("01/09 FPS PERSON" + String.fromCharCode(64 + (i % 26 || 26)) + " " + (i * 10) + ".00 OUT");
r = qb.build(many.join("\n"), { country: "uk" });
eq("cap 25", r.questions, 25);
eq("later are smallest", r.later, [5, 4, 3, 2, 1]);
eq("no whatsapp over 5", r.whatsapp, "");

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
