// node tests/test-sa-fee.js
var sa = require("../docs/guides/sa-fee.js");
var pass = 0, fail = 0;
function eq(name, got, want) {
  if (JSON.stringify(got) === JSON.stringify(want)) pass++;
  else { fail++; console.log("FAIL " + name + "\n  got  " + JSON.stringify(got) + "\n  want " + JSON.stringify(want)); }
}
function ok(name, cond) { eq(name, !!cond, true); }
function has(name, text, part) { ok(name + " has " + JSON.stringify(part), String(text).indexOf(part) >= 0); }
function hasnt(name, text, part) { ok(name + " lacks " + JSON.stringify(part), String(text).indexOf(part) < 0); }

// Tax years and deadlines (gov.uk: online 31 Jan, paper 31 Oct, tax code 30 Dec).
eq("2025/26", sa.taxYear("2025/26"), { year: "2025/26", endYear: 2026, filing: "31 January 2027", paper: "31 October 2026", taxCode: "30 December 2026" });
eq("2026/27 filing", sa.taxYear("2026/27").filing, "31 January 2028");
eq("bad year falls back", sa.taxYear("1999/00").year, "2025/26");

// Simple employee with interest: 45 + 10 + 15 + 30 = 100 min; +10% = 110 min; × £40/h = 73.33 -> 75.
var q1 = sa.quote({ rate: 40, employments: 1, savings: true });
eq("q1 base", q1.baseMins, 100);
eq("q1 mins", q1.mins, 110);
eq("q1 fee", q1.fee, 75);
eq("q1 no surcharge", q1.surcharge, 0);
eq("q1 vat null", q1.vat, null);
eq("q1 warnings", q1.warnings, []);
eq("q1 hours", q1.hours, "1.8");

// Sole trader, short pages, bank statements (×1.6): 45 + 90×1.6=144 + 30 = 219; +10% = 240.9; Dec +15% = 277.0 min.
// 277.04/60 × 40 = 184.69 -> 185; normal 240.9/60×40 = 160.6 -> 165.
var q2 = sa.quote({ rate: 40, seShort: 1, records: "statements", when: "dec" });
eq("q2 base", q2.baseMins, 219);
eq("q2 mins", q2.mins, 277);
eq("q2 fee", q2.fee, 185);
eq("q2 normal", q2.normalFee, 165);
eq("q2 surcharge", q2.surcharge, 20);
eq("q2 late pct", q2.latePct, 15);

// Landlord with 3 properties from a bag (×2.2): property 60 + 2×30 = 120 × 2.2 = 264.
var q3 = sa.quote({ rate: 50, properties: 3, records: "bag" });
var pl3 = q3.lines.filter(function (l) { return l.page === "SA105"; })[0];
eq("q3 property mins", pl3.mins, 264);
eq("q3 property label", pl3.label, "3 rental properties");

// Records multiplier doesn't touch employment or gains.
var q4a = sa.quote({ rate: 40, employments: 2, disposals: 2, records: "summary" });
var q4b = sa.quote({ rate: 40, employments: 2, disposals: 2, records: "bag" });
eq("multiplier only bookwork", q4a.fee, q4b.fee);
has("bag warning", q4b.warnings.join(" "), "Loose paperwork only changes");

// Custom late %, custom times, contingency.
var q5 = sa.quote({ rate: 60, employments: 1, when: "jan1", latePct: { jan1: "40" }, contingency: 0, times: { base: 30, queries: 15, employment: 15 } });
eq("q5 base", q5.baseMins, 60);
eq("q5 mins", q5.mins, 84);
eq("q5 fee", q5.fee, 85);
eq("q5 latePct", q5.latePct, 40);

// VAT: 75 × 1.2 = 90.
eq("vat", sa.quote({ rate: 40, employments: 1, savings: true, vatReg: true }).vat, 90);

// Warnings.
has("no rate", sa.quote({ employments: 1 }).warnings.join(" "), "Enter your hourly rate");
eq("no rate fee 0", sa.quote({ employments: 1 }).fee, 0);
has("jan2", sa.quote({ rate: 40, when: "jan2" }).warnings.join(" "), "31 January 2027");
has("jan2 2026/27", sa.quote({ rate: 40, when: "jan2", taxYear: "2026/27" }).warnings.join(" "), "31 January 2028");
has("turnover", sa.quote({ rate: 40, seShort: 1, turnoverOver: true }).warnings.join(" "), "SA103F");
eq("turnover with full ok", sa.quote({ rate: 40, seShort: 1, seFull: 1, turnoverOver: true }).warnings, []);
has("60-day", sa.quote({ rate: 40, disposals: 1, residentialSale: true }).warnings.join(" "), "60 days");
has("mtd no source", sa.quote({ rate: 40, employments: 1, mtd: true }).warnings.join(" "), "only covers self-employment and property");

// MTD: 1 self-employment + property = 2 sources × 4 × 30 = 240 min × 1.0 × 1.1 = 264 min × £40 = 176 -> 180; monthly 15.
var q6 = sa.quote({ rate: 40, seFull: 1, properties: 2, mtd: true });
eq("mtd sources", q6.mtd.sources, 2);
eq("mtd updates", q6.mtd.updates, 8);
eq("mtd mins", q6.mtd.mins, 264);
eq("mtd fee", q6.mtd.fee, 180);
eq("mtd monthly", q6.mtd.monthly, 15);
eq("mtd off", sa.quote({ rate: 40, seFull: 1 }).mtd, null);

// Input cleaning.
eq("negative counts", sa.quote({ rate: 40, employments: -3 }).lines.length, 2);
eq("decimal counts floor", sa.quote({ rate: 40, employments: "2.7" }).lines[1].label, "2 employments (P60 / P11D)");
eq("count cap 50", sa.quote({ rate: 40, employments: 999 }).lines[1].label, "50 employments (P60 / P11D)");
eq("rate with £", sa.quote({ rate: "£40", employments: 1, savings: true }).fee, 75);
eq("bad records", sa.quote({ rate: 40, records: "nope" }).records, "summary");
eq("bad when", sa.quote({ rate: 40, when: "nope" }).when, "nov");
eq("contingency cap", sa.quote({ rate: 40, contingency: 500 }).contingency, 100);

// Every combination builds a sane quote and email.
var flags = ["savings", "foreign", "residence", "pension", "hicbc", "studentLoan", "poaReduce", "firstYear", "mtd", "vatReg"];
var n = 0, bad = 0;
["summary", "statements", "bag"].forEach(function (rec) {
  ["nov", "dec", "jan1", "jan2"].forEach(function (when) {
    [0, 1, 2].forEach(function (se) {
      [0, 1, 4].forEach(function (props) {
        for (var mask = 0; mask < (1 << flags.length); mask += 37) {
          var o = { rate: 45, records: rec, when: when, seShort: se, properties: props, employments: 1, disposals: se, taxYear: sa.YEARS[mask % 2], client: "Sam", me: "Alex" };
          flags.forEach(function (f, i) { if (mask & (1 << i)) o[f] = true; });
          var q = sa.quote(o), e = sa.email(o, q);
          n++;
          var problems = [];
          if (!(q.fee > 0) || q.fee % 5) problems.push("fee " + q.fee);
          if (q.fee < q.normalFee) problems.push("late < normal");
          if ((when === "nov") !== (q.surcharge === 0)) problems.push("surcharge " + q.surcharge);
          if (e.indexOf("undefined") >= 0 || e.indexOf("NaN") >= 0 || e.indexOf("[") >= 0) problems.push("email junk");
          if (e.indexOf(sa.money(q.fee)) < 0) problems.push("email fee");
          if (e.indexOf(q.year.filing) < 0) problems.push("email deadline");
          if (o.vatReg && e.indexOf("plus VAT") < 0) problems.push("email VAT");
          if (q.mtd && e.indexOf("Making Tax Digital") < 0) problems.push("email MTD");
          if (q.surcharge > 0 && e.indexOf("late-records charge") < 0) problems.push("email surcharge");
          if (q.surcharge === 0 && e.indexOf("late-records charge") >= 0) problems.push("email surcharge when none");
          if (problems.length) { bad++; if (bad < 5) console.log("combo", JSON.stringify(o), problems); }
        }
      });
    });
  });
});
eq("combos clean", bad, 0);
ok("combos counted", n > 1000);

// Email details.
var e1 = sa.email({ rate: 40, seShort: 1, records: "statements", when: "dec", client: "Priya", me: "Jo" });
has("e1", e1, "Hi Priya,");
has("e1", e1, "2025/26 Self Assessment");
has("e1", e1, "£185");
has("e1", e1, "£165");
has("e1", e1, "(SA103S)");
has("e1", e1, "bank statements and receipts to categorise");
has("e1", e1, "30 December 2026");
has("e1", e1, "less than £3,000");
has("e1", e1, "60 days");
has("e1", e1, "Jo");
hasnt("e1 no queries line in pages", e1, "Queries, chasing");
var e2 = sa.email({ rate: 40, employments: 1 });
has("e2 default name", e2, "Hi there,");
has("e2 default sig", e2, "[your name]");
has("e2 nov", e2, "arrive by 30 November 2026");

// Late clause.
var c1 = sa.lateClause({});
has("clause", c1, "30 November 2026");
has("clause", c1, "rises by 15%");
has("clause", c1, "1 and 15 January 2027 by 30%");
has("clause", c1, "add 50%");
has("clause", c1, "31 January 2027");
has("clause", c1, "£100 penalty");
has("clause custom", sa.lateClause({ taxYear: "2026/27", latePct: { dec: 10, jan1: 20, jan2: 40 } }), "rises by 10%, and between 1 and 15 January 2028 by 20%");

// Price list: main return 45+10+30 = 85 × 1.1 = 93.5 min × £40 = 62.33 -> 65.
var pl = sa.priceList({ rate: 40 });
eq("pl rows", pl.rows.length, 14);
eq("pl main", pl.rows[0][1], 65);
eq("pl SA103S", pl.rows[2][1], 70);     // 90×1.1=99 min -> 66 -> 70
eq("pl MTD", pl.rows[13][1], 90);       // 120×1.1=132 min -> 88 -> 90
has("pl csv", pl.csv, "Item,Price (GBP)\n");
has("pl csv late", pl.csv, '"Records in December",+15%');
has("pl csv bag", pl.csv, "x2.2");
has("pl csv vat", sa.priceList({ rate: 40, vatReg: true }).csv, "plus VAT");
ok("pl all > 0", pl.rows.every(function (r) { return r[1] > 0 && r[1] % 5 === 0; }));

// Helpers.
eq("money", sa.money(1234.5), "£1,234.50");
eq("money whole", sa.money(90), "£90");
eq("roundUp exact", sa.roundUp(75, 5), 75);
eq("roundUp zero", sa.roundUp(0, 5), 0);

console.log(pass + "/" + (pass + fail) + " passed");
process.exit(fail ? 1 : 0);
