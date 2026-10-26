// node tests/test-questionnaire-builder.js
var qb = require("../docs/guides/questionnaire-builder.js");
var pass = 0, fail = 0;
function eq(name, got, want) {
  if (JSON.stringify(got) === JSON.stringify(want)) pass++;
  else { fail++; console.log("FAIL " + name + "\n  got  " + JSON.stringify(got) + "\n  want " + JSON.stringify(want)); }
}
function ok(name, cond) { eq(name, !!cond, true); }
function ids(r) { return r.questions.map(function (q) { return q.id; }); }

// Every question has the fields the page needs, and ids are unique.
var seen = {};
qb.BANK.forEach(function (b) {
  ok("fields " + b.id, b.id && b.q && b.why && b.docs.length && b.t.length && /^(uk|us|both)$/.test(b.c));
  ok("unique " + b.id, !seen[b.id]); seen[b.id] = 1;
});

// UK plumber, sole trader, SA 31 Jan 2027, 8 weeks prep.
var r = qb.buildPack({ country: "uk", types: ["uk-sole-trader"], deadline: "2027-01-31", prepWeeks: 8, today: "2026-10-26", client: "Sam" });
// 31 Jan 2027 (Sun) - 56 days = Sun 6 Dec 2026 -> Fri 4 Dec.
eq("uk due", r.recordsDue, "2026-12-04");
eq("uk due text", r.recordsDueText, "Friday 4 December 2026");
eq("uk no warning", r.warning, "");
ok("uk has sole trader q", ids(r).indexOf("st-vehicle") >= 0 && ids(r).indexOf("st-cis") >= 0);
ok("uk has everyone q", ids(r).indexOf("child-benefit") >= 0 && ids(r).indexOf("pension") >= 0);
ok("uk no US q", ids(r).every(function (i) { return !/-us$|^c-|^r-|^k1/.test(i); }));
ok("uk no landlord q", ids(r).indexOf("ll-rent") < 0);
ok("uk no events", ids(r).indexOf("ev-baby") < 0);
eq("uk numbered", r.questions.map(function (q) { return q.n; }).slice(0, 3), [1, 2, 3]);
ok("uk threshold default", r.questions.some(function (q) { return q.q.indexOf("over £500 for the business") >= 0; }));
ok("uk email date", r.email.indexOf("by Friday 4 December 2026") >= 0 && r.email.indexOf("Hi Sam,") === r.email.indexOf("Hi "));
ok("uk text checklist", /\[ \] 1\. \(Q\d+\) /.test(r.text));
ok("uk gov.uk line", r.text.indexOf("gov.uk") >= 0);
ok("uk no password ask", !/send (us )?your password/i.test(r.email) && r.email.indexOf("don't email passwords") >= 0);
ok("uk count under 30", r.questions.length <= 30);

// Checklist items are unique and each points at a question number.
var items = r.checklist.map(function (c) { return c.item; });
eq("uk checklist unique", items.length, Object.keys(items.reduce(function (a, x) { a[x] = 1; return a; }, {})).length);
ok("uk checklist q refs", r.checklist.every(function (c) { return c.q >= 1 && c.q <= r.questions.length; }));

// Landlord and director together, custom threshold, events.
r = qb.buildPack({ country: "uk", types: ["uk-landlord", "uk-director", "us-rental"], events: ["ev-baby", "ev-home"], deadline: "2027-01-31", prepWeeks: 6, threshold: "£1,000" });
ok("ll+dir", ids(r).indexOf("ll-finance") >= 0 && ids(r).indexOf("dir-dla") >= 0);
ok("other country type ignored", ids(r).indexOf("r-rent") < 0);
ok("events shown", ids(r).indexOf("ev-baby") >= 0 && ids(r).indexOf("ev-home") >= 0);
ok("capital q via landlord", ids(r).indexOf("st-capital") >= 0);
ok("custom threshold", r.questions.some(function (q) { return q.q.indexOf("over £1000") >= 0; }));
eq("types", r.types, ["uk-landlord", "uk-director"]);
// 31 Jan - 42 days = Sun 20 Dec -> Fri 18 Dec.
eq("uk 6wk due", r.recordsDue, "2026-12-18");

// No type ticked = individual only.
r = qb.buildPack({ country: "uk", types: [], deadline: "2027-01-31", prepWeeks: 4 });
eq("default type", r.types, ["uk-individual"]);
ok("individual has no st q", ids(r).indexOf("st-sales") < 0 && ids(r).indexOf("other-income") >= 0);

// US Schedule C with tips, overtime, car loan, senior; 1040 Apr 15 2027, 6 weeks.
r = qb.buildPack({ country: "us", types: ["us-schedule-c"], events: ["tips", "overtime", "car-loan", "senior"], deadline: "2027-04-15", prepWeeks: 6, client: "Jo" });
// Apr 15 2027 (Thu) - 42 = Thu Mar 4.
eq("us due", r.recordsDue, "2027-03-04");
eq("us due text", r.recordsDueText, "Thursday, March 4, 2027");
ok("us new deductions", ["tips-us", "overtime-us", "car-loan-us", "senior-us"].every(function (i) { return ids(r).indexOf(i) >= 0; }));
ok("us schedule c", ids(r).indexOf("c-home") >= 0 && ids(r).indexOf("c-1099") >= 0);
ok("us no UK q", ids(r).indexOf("child-benefit") < 0 && ids(r).indexOf("st-cis") < 0);
ok("us threshold $", r.questions.every(function (q) { return q.q.indexOf("£") < 0; }));
ok("us irs line", r.text.indexOf("irs.gov") >= 0);
ok("us 1099-K fact", r.questions.some(function (q) { return q.why.indexOf("$20,000 in more than 200") >= 0; }));
ok("us 1099-NEC both years", r.questions.some(function (q) { return q.q.indexOf("$600 or more during 2025, or $2,000 or more during 2026") >= 0; }));
ok("us no SSN by email", r.questions.some(function (q) { return q.docs.join(" ").indexOf("not email") >= 0; }));

// US without the new-deduction ticks doesn't ask them.
r = qb.buildPack({ country: "us", types: ["us-individual"], deadline: "2027-04-15", prepWeeks: 6 });
ok("us no tips unless ticked", ids(r).indexOf("tips-us") < 0);

// Errors and warnings.
eq("bad deadline", qb.buildPack({ country: "uk", deadline: "2027-02-30", prepWeeks: 4 }).error, "Enter the filing deadline as a date.");
ok("bad prep", qb.buildPack({ country: "uk", deadline: "2027-01-31", prepWeeks: "x" }).error);
ok("prep too big", qb.buildPack({ country: "uk", deadline: "2027-01-31", prepWeeks: 40 }).error);
r = qb.buildPack({ country: "uk", deadline: "2027-01-31", prepWeeks: 4, today: "2027-01-10" });
ok("past due warning", r.warning.indexOf("already passed") >= 0);
eq("zero prep weekday", qb.buildPack({ country: "uk", deadline: "2027-01-31", prepWeeks: 0 }).recordsDue, "2027-01-29");

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
