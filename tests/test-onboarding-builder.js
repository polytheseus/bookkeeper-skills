// Tests for docs/guides/onboarding-builder.js (node tests/test-onboarding-builder.js)
var ob = require("../docs/guides/onboarding-builder.js");
var pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.log("FAIL: " + m); } }
var T = "2026-10-28"; // a Wednesday

// Errors
ok(ob.buildPlan({ country: "uk", entity: "nope", services: ["books"], today: T }).error, "bad entity");
ok(ob.buildPlan({ country: "uk", entity: "ltd", services: [], today: T }).error, "no services");
ok(ob.buildPlan({ country: "uk", entity: "ltd", services: ["books"], today: T, firstDeadline: "2026-13-01" }).error, "bad deadline");
ok(ob.buildPlan({ country: "uk", entity: "ltd", services: ["books"] }).error, "no today");
ok(ob.buildPlan({ country: "uk", entity: "ltd", services: ["return"], today: T }).error, "US-only service on UK");

// Weekdays only
for (var i = 0; i < 60; i++) {
  var d = ob.addDays(new Date(Date.UTC(2026, 9, 28)), i).getUTCDay();
  ok(d !== 0 && d !== 6, "weekday for +" + i);
}

// Risk rating
var r = ob.rateRisk({ country: "uk", faceToFace: true, risks: [] });
ok(r.level === "Low" && r.edd.length === 0 && r.reviewMonths === 12, "low risk");
r = ob.rateRisk({ country: "uk", faceToFace: false, risks: [] });
ok(r.level === "Medium" && r.edd.length === 1, "not met = EDD, medium");
r = ob.rateRisk({ country: "uk", faceToFace: true, risks: ["pep"] });
ok(r.level === "High" && /senior management/.test(r.edd[0]) && r.reviewMonths === 6, "PEP high");
r = ob.rateRisk({ country: "uk", faceToFace: true, risks: ["cash"] });
ok(r.level === "Medium" && r.edd.length === 0, "cash medium, no EDD");
r = ob.rateRisk({ country: "uk", faceToFace: true, risks: ["cash", "crypto"] });
ok(r.level === "High", "two mid factors = high");
r = ob.rateRisk({ country: "uk", faceToFace: true, risks: ["reluctant"] });
ok(r.level === "High" && /stop dealing/.test(r.stop), "reluctant stops");
r = ob.rateRisk({ country: "uk", faceToFace: true, risks: ["overseas"] });
ok(r.level === "High" && /FATF/.test(r.edd[0]), "FATF country");

// UK limited company, previous accountant, VAT + payroll
var p = ob.buildPlan({ country: "uk", entity: "ltd", services: ["books", "vat", "payroll", "ct"], today: T, hasPrevious: true, previous: "Smith & Co", faceToFace: true, client: "Bright Bakes Ltd", contact: "Jo Bright", practice: "Priya, Ledger Lane", firstDeadline: "2027-02-07" });
ok(!p.error, "ltd plan builds");
var txt = p.text;
ok(/regulation 30A/.test(txt) && /more than 25%/.test(txt) && /identity verification/.test(txt), "company CDD items");
ok(/5 years from the date the relationship ends/.test(txt), "record keeping");
ok(/digital handshake/.test(txt) && /21 days/.test(txt), "VAT handshake + expiry check");
ok(/PAYE: Online Agent Authorisation/.test(txt) && /Corporation Tax: Online/.test(txt), "PAYE + CT auth");
ok(/Don't use the client's own HMRC sign-in/.test(txt), "no client sign-in");
ok(/Chase clearance/.test(txt), "clearance chase");
ok(p.clearance && /Smith & Co/.test(p.clearance) && /14 days/.test(p.clearance) && /VAT registration details/.test(p.clearance), "clearance letter");
ok(/Hi Jo,/.test(p.welcome) && /letter from HMRC with a code/.test(p.welcome), "welcome contact + HMRC line");
ok(/Ongoing monitoring/.test(txt) && /every 12 months/.test(txt), "monitoring 12 months");
ok(p.warnings.length === 0, "no warnings for a Feb deadline");
for (var k = 1; k < p.steps.length; k++) ok(p.steps[k].date >= p.steps[k - 1].date, "sorted " + k);
ok(/PAYE reference/.test(p.docs.join()) && /Companies House authentication code/.test(p.docs.join()), "docs for payroll + CT");
ok(p.csv.split("\n")[0] === "Date,Stage,Task,Detail,Done" && p.csv.split("\n").length === p.steps.length + 1, "csv rows");
ok(/"Due diligence"|Due diligence/.test(p.csv), "csv content");

// Sole trader, no previous accountant, not met, deadline soon
p = ob.buildPlan({ country: "uk", entity: "sole", services: ["books", "mtd", "sa"], today: T, faceToFace: false, firstDeadline: "2026-11-07" });
ok(!p.error && p.risk.level === "Medium", "sole trader medium");
ok(/Enhanced due diligence/.test(p.text), "EDD step present");
ok(!/regulation 30A/.test(p.text) && !/Chase clearance/.test(p.text) && p.clearance === "", "no company/clearance items");
ok(p.warnings.length === 1 && /only 10 days away/.test(p.warnings[0]), "deadline warning: " + p.warnings);
ok(/MTD for Income Tax: the digital handshake/.test(p.text) && /Self Assessment: Online Agent Authorisation/.test(p.text), "MTD + SA auth");
ok(/MTD threshold/.test(p.docs.join()) && /UTR/.test(p.docs.join()), "MTD docs");
ok(/\[client name\]/.test(p.text) && /\[first name\]/.test(p.welcome) && /\[your name and practice\]/.test(p.welcome), "placeholders");

// Past deadline + reluctant
p = ob.buildPlan({ country: "uk", entity: "partnership", services: ["books"], today: T, faceToFace: true, risks: ["reluctant"], firstDeadline: "2026-10-01" });
ok(/stop dealing/.test(p.warnings[0]) && /already past/.test(p.warnings[1]), "stop first, then past");
ok(/more than 25% of capital/.test(p.text), "partnership BO");
ok(!/Request HMRC authorisation/.test(p.text), "bookkeeping only = no HMRC auth step");

// US
p = ob.buildPlan({ country: "us", entity: "scorp", services: ["books", "payroll", "return"], today: T, hasPrevious: true, client: "Ruiz Design Inc", contact: "Ana Ruiz" });
ok(!p.error && p.risk === null, "US no MLR risk");
ok(/Form 2848/.test(p.text) && /Publication 4557/.test(p.text) && /CP261/.test(p.docs.join()), "US auth, 4557, S election");
ok(!/HMRC/.test(p.text + p.welcome) && !/Money Laundering/.test(p.text), "no UK terms in US");
ok(p.clearance === "" && /Previous preparer/.test(p.text), "US previous preparer step");
ok(/8821 or 2848/.test(p.welcome) && /Hi Ana,/.test(p.welcome), "US welcome");
ok(!/\bundefined\b|NaN/.test(p.text + p.welcome + p.csv), "no undefined US");

// Every combination builds cleanly
var n = 0;
["uk", "us"].forEach(function (c) {
  Object.keys(ob.ENTITIES[c]).forEach(function (e) {
    var svcs = Object.keys(ob.SERVICES[c]);
    [svcs.slice(0, 1), svcs, svcs.slice(1, 3)].forEach(function (sv) {
      [true, false].forEach(function (prev) {
        var q = ob.buildPlan({ country: c, entity: e, services: sv, today: T, hasPrevious: prev, faceToFace: !prev, risks: prev ? ["cash"] : [], firstDeadline: "2027-01-31" });
        n++;
        ok(!q.error, "combo " + c + e + sv + prev);
        ok(!/\bundefined\b|NaN|Invalid/.test(q.text + q.welcome + q.clearance + q.csv), "clean combo " + c + e + sv);
        ok(q.steps.length >= 6, "steps combo");
        ok(/Engagement letter/.test(q.text) && /First records request/.test(q.text) && /30-day review/.test(q.text), "core steps combo");
      });
    });
  });
});
console.log(pass + "/" + (pass + fail) + " passed (" + n + " combos)");
process.exit(fail ? 1 : 0);
