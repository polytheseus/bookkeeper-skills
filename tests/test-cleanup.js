// node tests/test-cleanup.js
var cu = require("../docs/guides/cleanup.js");
var pass = 0, fail = 0;
function eq(name, got, want) {
  if (JSON.stringify(got) === JSON.stringify(want)) pass++;
  else { fail++; console.log("FAIL " + name + "\n  got  " + JSON.stringify(got) + "\n  want " + JSON.stringify(want)); }
}
function ok(name, cond) { eq(name, !!cond, true); }
function has(r, s) { return r.tasks.some(function (t) { return t.task.indexOf(s) >= 0; }); }
function dls(r) { return r.deadlines.map(function (x) { return x.date + " " + x.what.split(" (")[0]; }); }
var T = "2026-10-29";

// Month parsing and errors.
eq("parse", cu.parseMonth("2026-04"), { y: 2026, m: 3 });
eq("parse bad", cu.parseMonth("2026-13"), null);
ok("err missing", cu.build({ start: "", end: "2026-09" }, T).error);
ok("err order", /before the first/.test(cu.build({ start: "2026-09", end: "2026-01" }, T).error));
ok("err long", /10 years/.test(cu.build({ start: "2010-01", end: "2026-09" }, T).error));
ok("err no accounts", /at least one/.test(cu.build({ start: "2026-01", end: "2026-09", banks: 0, cards: 0, processors: 0 }, T).error));

// UK sole trader, Apr 2025 - Sep 2026: two tax years, 18 months.
var a = cu.build({ country: "uk", entity: "sole", start: "2025-04", end: "2026-09", banks: 1, cards: 1, processors: 1, records: "some", software: "spreadsheet", client: "HALE01" }, T);
eq("a months", a.months, 18);
eq("a accounts", a.accounts, 3);
eq("a account-months", a.accountMonths, 54);
eq("a deadlines", dls(a), ["2027-01-31 Self Assessment return for 2025/26", "2028-01-31 Self Assessment return for 2026/27"]);
eq("a not passed", a.deadlines.map(function (x) { return x.passed; }), [false, false]);
eq("a days", a.deadlines[0].daysLeft, 94);
eq("a stages", a.stages.map(function (s) { return s.from + "-" + s.to; }), ["April 2025-March 2026", "April 2026-September 2026"]);
ok("a drawings", has(a, "drawings"));
ok("a no DLA", !has(a, "director's loan"));
ok("a spreadsheet", has(a, "Moving from a spreadsheet"));
ok("a missing", has(a, "Missing statements"));
ok("a processors", has(a, "Stripe, PayPal"));
ok("a novat", has(a, "£90,000"));
ok("a no VAT652", !has(a, "VAT652"));
ok("a no payroll", !has(a, "payroll journals"));
ok("a CIS", has(a, "CIS"));
ok("a no 1099", !has(a, "1099"));
eq("a requests", a.requests.map(function (r) { return r.account + "|" + r.statements; }), ["Bank account|18 monthly statements", "Credit card|18 monthly statements", "Payment processor (Stripe, PayPal, Square...)|18 monthly statements"]);
ok("a email period", a.email.indexOf("April 2025 to September 2026 (18 months)") > 0);
ok("a email subject", a.email.indexOf("Subject: HALE01: ") === 0);
ok("a email no logins", a.email.indexOf("don't send passwords") > 0);
ok("a email deadline", a.email.indexOf("31 January 2027") > 0);
ok("a csv header", a.csv.indexOf("Client,Section,Item,Detail,Date,Done,Notes\r\n") === 0);
ok("a csv deadline", a.csv.indexOf("2027-01-31") > 0);
ok("a csv rows", a.csv.split("\r\n").length - 2 === a.requests.length + a.deadlines.length + a.stages.length + a.tasks.length);
ok("a 90-day warn absent", !a.warnings.some(function (w) { return /next 90 days/.test(w); }));
ok("a not over 24", !a.warnings.some(function (w) { return /big job/.test(w); }));
// Same job a month later: 31 Jan 2027 is within 90 days.
var a2 = cu.build({ country: "uk", entity: "sole", start: "2025-04", end: "2026-09" }, "2026-11-15");
ok("a2 soon", a2.warnings.some(function (w) { return /next 90 days/.test(w) && /31 January 2027/.test(w); }));

// UK sole trader 2023-2026: passed deadlines flagged.
var b = cu.build({ country: "uk", entity: "sole", start: "2023-04", end: "2026-03", records: "none", software: "none" }, T);
eq("b deadlines", b.deadlines.map(function (x) { return x.date + (x.passed ? " passed" : ""); }), ["2025-01-31 passed", "2026-01-31 passed", "2027-01-31"]);
ok("b passed warn", b.warnings.some(function (w) { return /^2 filing deadlines/.test(w); }));
ok("b big job", b.warnings.some(function (w) { return /36 months is a big job/.test(w); }));
ok("b no statements", b.warnings.some(function (w) { return /No statements yet/.test(w); }));
ok("b set up file", has(b, "No software yet"));
eq("b stages", b.stages.length, 3);
ok("b email passed", b.email.indexOf("(passed: can you tell me if it was filed?)") > 0);
// January start: Jan-Mar 2026 belongs to 2025/26.
var b2 = cu.build({ country: "uk", entity: "sole", start: "2026-01", end: "2026-05" }, T);
eq("b2 tax years", b2.deadlines.map(function (x) { return x.period; }), ["2025/26", "2026/27"]);
eq("b2 stages", b2.stages.map(function (s) { return s.months; }), [3, 2]);
// Partnership wording.
ok("partnership", /SA800/.test(cu.build({ country: "uk", entity: "partnership", start: "2025-06", end: "2025-08" }, T).deadlines[0].what));

// UK company, year end 31 March, Jan 2025 - Aug 2026, VAT, payroll, loans, stock.
var c = cu.build({ country: "uk", entity: "company", yearEnd: 2, start: "2025-01", end: "2026-08", banks: 2, cards: 0, processors: 0, vat: true, payroll: true, loans: true, stock: true, records: "full", software: "messy" }, T);
eq("c deadlines", dls(c), [
  "2025-12-31 Annual accounts to Companies House", "2026-01-01 Corporation Tax payment", "2026-03-31 Company Tax Return CT600",
  "2026-12-31 Annual accounts to Companies House", "2027-01-01 Corporation Tax payment", "2027-03-31 Company Tax Return CT600",
  "2027-12-31 Annual accounts to Companies House", "2028-01-01 Corporation Tax payment", "2028-03-31 Company Tax Return CT600"]);
eq("c passed", c.deadlines.filter(function (x) { return x.passed; }).length, 3);
eq("c stages", c.stages.map(function (s) { return s.from + "-" + s.to; }), ["January 2025-March 2025", "April 2025-March 2026", "April 2026-August 2026"]);
ok("c DLA", has(c, "director's loan"));
ok("c no drawings", !has(c, "to drawings"));
ok("c VAT compare", has(c, "Compare each filed VAT return"));
ok("c VAT652", has(c, "VAT652"));
ok("c no novat", !has(c, "registration threshold"));
ok("c payroll", has(c, "payroll journals"));
ok("c loans", has(c, "interest and capital"));
ok("c stock", has(c, "stock"));
ok("c messy TB", has(c, "run a trial balance at the start date"));
ok("c no missing", !has(c, "Missing statements"));
eq("c requests", c.requests.map(function (r) { return r.account; }), ["Bank account 1", "Bank account 2", "Loans and finance (one statement each)"]);
ok("c email VAT", c.email.indexOf("VAT returns filed") > 0);
ok("c email payroll", c.email.indexOf("Payroll reports") > 0);
ok("c email stock", c.email.indexOf("stock figure") > 0);
ok("c no MTD warn (software)", !c.warnings.some(function (w) { return /Making Tax Digital/.test(w); }));
ok("c MTD warn none", cu.build({ country: "uk", entity: "company", start: "2026-01", end: "2026-03", vat: true, software: "none" }, T).warnings.some(function (w) { return /Making Tax Digital/.test(w); }));
// Year end 30 June: CT payment 1 April? 30 Jun + 9 months = 30 Mar, + 1 day = 31 Mar.
var c2 = cu.build({ country: "uk", entity: "company", yearEnd: 5, start: "2025-07", end: "2026-06" }, T);
eq("c2 jun", dls(c2), ["2027-03-31 Annual accounts to Companies House", "2027-03-31 Corporation Tax payment", "2027-06-30 Company Tax Return CT600"]);
// Year end 28 Feb 2026: accounts 30 Nov, CT 29 Nov, CT600 28 Feb 2027.
var c3 = cu.build({ country: "uk", entity: "company", yearEnd: 1, start: "2025-03", end: "2026-02" }, T);
eq("c3 feb", dls(c3), ["2026-11-29 Corporation Tax payment", "2026-11-30 Annual accounts to Companies House", "2027-02-28 Company Tax Return CT600"]);
// Year end 30 Sep: CT 1 July.
eq("c4 sep", dls(cu.build({ country: "uk", entity: "company", yearEnd: 8, start: "2025-10", end: "2026-09" }, T))[1], "2027-07-01 Corporation Tax payment");

// US.
var u = cu.build({ country: "us", entity: "sole", start: "2025-01", end: "2026-09", salestax: true, processors: 2 }, T);
eq("u deadlines", dls(u), ["2026-04-15 Form 1040 with Schedule C for 2025", "2027-04-15 Form 1040 with Schedule C for 2026"]);
ok("u 1099", has(u, "1099-NEC"));
ok("u 8821", has(u, "8821"));
ok("u no CIS", !has(u, "CIS"));
ok("u no VAT", !has(u, "VAT return") && !has(u, "£"));
ok("u salestax", has(u, "sales tax return"));
ok("u drawings", has(u, "drawings"));
eq("u requests", u.requests.map(function (r) { return r.account; }), ["Bank account", "Payment processor 1", "Payment processor 2"]);
ok("u email salestax", u.email.indexOf("sales tax returns") > 0);
eq("u stages", u.stages.map(function (s) { return s.months; }), [12, 9]);
eq("us partnership", dls(cu.build({ country: "us", entity: "partnership", start: "2026-01", end: "2026-06" }, T)), ["2027-03-15 Form 1065 partnership return for 2026"]);
eq("us scorp", dls(cu.build({ country: "us", entity: "scorp", start: "2025-06", end: "2026-02", yearEnd: 5 }, T)), ["2026-03-15 Form 1120-S for 2025", "2027-03-15 Form 1120-S for 2026"]);
ok("us scorp draws", has(cu.build({ country: "us", entity: "scorp", start: "2026-01", end: "2026-03" }, T), "shareholder loan"));
eq("us ccorp dec", dls(cu.build({ country: "us", entity: "ccorp", yearEnd: 11, start: "2026-01", end: "2026-06" }, T)), ["2027-04-15 Form 1120 corporate return"]);
eq("us ccorp sep", dls(cu.build({ country: "us", entity: "ccorp", yearEnd: 8, start: "2025-10", end: "2026-09" }, T)), ["2027-01-15 Form 1120 corporate return"]);
eq("us ccorp jun", dls(cu.build({ country: "us", entity: "ccorp", yearEnd: 5, start: "2025-07", end: "2026-06" }, T)), ["2026-09-15 Form 1120 corporate return"]);
// Bad entity for the country falls back to sole.
eq("fallback", cu.build({ country: "us", entity: "company", start: "2026-01", end: "2026-02" }, T).entityLabel, "Sole proprietor or single-member LLC");

// Current month warning.
ok("unfinished month", cu.build({ start: "2026-08", end: "2026-10" }, T).warnings.some(function (w) { return /hasn't finished/.test(w); }));
ok("finished month", !cu.build({ start: "2026-08", end: "2026-09" }, T).warnings.some(function (w) { return /hasn't finished/.test(w); }));
// Single month wording.
var s1 = cu.build({ start: "2026-09", end: "2026-09" }, T);
eq("single", s1.requests[0].statements, "1 monthly statement");
ok("single email", s1.email.indexOf("(1 month)") > 0);
// CSV injection guard and quoting.
ok("csv guard", cu.build({ start: "2026-09", end: "2026-09", client: "=cmd" }, T).csv.indexOf("'=cmd") > 0);

// Every combination builds without error, has tasks in phase order and a non-empty email.
var combos = 0, bad = 0;
["uk", "us"].forEach(function (country) {
  Object.keys(cu.ENTITIES[country]).forEach(function (entity) {
    ["full", "some", "none"].forEach(function (records) {
      ["none", "spreadsheet", "messy"].forEach(function (software) {
        [true, false].forEach(function (flag) {
          var r = cu.build({ country: country, entity: entity, yearEnd: 2, start: "2024-11", end: "2026-09", records: records, software: software, vat: flag, salestax: flag, payroll: flag, loans: flag, stock: flag, processors: flag ? 1 : 0 }, T);
          combos++;
          var phases = r.tasks ? r.tasks.map(function (t) { return t.phase; }) : [];
          var sorted = phases.slice().sort();
          if (r.error || !r.tasks.length || JSON.stringify(phases) !== JSON.stringify(sorted) || !r.deadlines.length || r.email.indexOf("[Your name]") < 0 || /undefined|NaN/.test(r.text + r.email + r.csv)) { bad++; console.log("bad combo", country, entity, records, software, flag, r.error); }
        });
      });
    });
  });
});
eq("combos", combos, 126);
eq("bad combos", bad, 0);

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
