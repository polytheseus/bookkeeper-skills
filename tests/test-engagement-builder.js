// node tests/test-engagement-builder.js
var eb = require("../docs/guides/engagement-builder.js");
var pass = 0, fail = 0;
function eq(name, got, want) {
  if (JSON.stringify(got) === JSON.stringify(want)) pass++;
  else { fail++; console.log("FAIL " + name + "\n  got  " + JSON.stringify(got) + "\n  want " + JSON.stringify(want)); }
}
function ok(name, cond) { eq(name, !!cond, true); }

eq("ord", [1, 2, 3, 4, 11, 12, 13, 21, 22, 28].map(eb.ord), ["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "28th"]);
eq("money", [eb.money(1234.5, "£"), eb.money(150, "$"), eb.money(0, "£")], ["£1,234.50", "$150", "£0"]);
eb.SERVICES.forEach(function (s) { ok("fields " + s.id, s.id && s.name && s.need.length && s.not.length && /^(uk|us|both)$/.test(s.c)); });

// UK: books £150/m, VAT £90/q, payroll £40/m, VAT-registered practice.
var r = eb.build({ country: "uk", services: ["books", "vat", "payroll"], fees: { books: "150", vat: "90", payroll: "£40" }, start: "2026-11-01", dueDay: "7", transactions: "120", accounts: "2", employees: "3", payFreq: "monthly", vatRegistered: true, client: "Sam", practice: "Ledger Lane" });
eq("uk no error", r.error, undefined);
eq("uk annual", r.annual, 150 * 12 + 90 * 4 + 40 * 12);
eq("uk monthly", r.monthly, 220);
eq("uk vat", r.vat, 528);
eq("uk schedules", r.schedules.map(function (s) { return s.id; }), ["books", "vat", "payroll"]);
eq("uk no warnings", r.warnings, []);
ok("uk due day in need", r.schedules[0].need.join(" ").indexOf("by the 7th of the following month") >= 0);
ok("uk ready day", r.schedules[0].does.join(" ").indexOf("by the 15th of the following month") >= 0);
ok("uk start in exclusions", r.schedules[0].not.join(" ").indexOf("before 1 November 2026") >= 0);
ok("uk based on", r.schedules[0].based === "Up to 120 transactions a month across 2 bank and card accounts.");
ok("uk xero default", r.schedules[0].does[0].indexOf("in Xero") >= 0);
ok("uk payroll FPS", r.schedules[2].does.join(" ").indexOf("Full Payment Submission") >= 0);
ok("uk payroll no 941", r.text.indexOf("941") < 0);
ok("uk payroll pension excl", r.schedules[2].not.join(" ").indexOf("auto-enrolment") >= 0);
ok("uk out-of-scope clause", r.clauses[0].t.indexOf("before we start") >= 0);
ok("uk growth clause", r.clauses.some(function (c) { return c.h === "If your business grows"; }));
ok("uk vat note", r.feeNote.indexOf("20%") >= 0);
ok("uk AML term", r.terms.join(" ").indexOf("Money laundering") >= 0 && r.terms.join(" ").indexOf("5 years") >= 0);
ok("uk no 7216", r.text.indexOf("7216") < 0);
ok("uk email name", r.email.indexOf("Hi Sam,") >= 0 && r.email.indexOf("£220 a month plus VAT") >= 0);
ok("uk email sign", /Ledger Lane$/.test(r.email));
ok("uk text total", r.text.indexOf("Total: £2,640 a year, collected as £220 a month. VAT at 20%: £528 a year, total including VAT £3,168.") >= 0);
ok("uk no placeholders left", !/\{\w+\}/.test(r.text + r.email));
ok("uk fee per quarter", r.text.indexOf("£90 per quarter (£360 a year)") >= 0);

// UK not VAT registered.
var r2 = eb.build({ country: "uk", services: ["books"], fees: { books: "100" }, start: "2026-12-01", dueDay: "25", transactions: "50", accounts: "1" });
eq("uk2 vat", r2.vat, 0);
ok("uk2 note", r2.feeNote.indexOf("aren't registered") >= 0);
ok("uk2 singular account", r2.schedules[0].based.indexOf("1 bank and card account.") >= 0);
ok("uk2 ready capped", r2.schedules[0].does.join(" ").indexOf("by the 28th") >= 0);
ok("uk2 no growth clause missing", r2.clauses.length === 5);

// US: books + sales tax + payroll; US-only service filtering.
var u = eb.build({ country: "us", services: ["books", "salestax", "payroll", "vat"], fees: { books: "300", salestax: "75", payroll: "60" }, start: "2027-01-01", dueDay: "5", transactions: "300", accounts: "3", employees: "8", payFreq: "every two weeks" });
eq("us schedules (vat dropped)", u.schedules.map(function (s) { return s.id; }), ["books", "salestax", "payroll"]);
eq("us annual", u.annual, (300 + 75 + 60) * 12);
eq("us vat", u.vat, 0);
ok("us qbo default", u.text.indexOf("QuickBooks Online") >= 0);
ok("us 941", u.text.indexOf("Form 941") >= 0 && u.text.indexOf("Full Payment") < 0);
ok("us 7216 and assurance", u.terms.join(" ").indexOf("7216") >= 0 && u.terms.join(" ").indexOf("isn't an audit, review or compilation") >= 0);
ok("us no AML uk term", u.text.indexOf("Money Laundering Regulations") < 0);
ok("us dollar", u.text.indexOf("$5,220 a year") >= 0);
ok("us payfreq", u.schedules[2].based === "Up to 8 employees, paid every two weeks.");

// Warnings and errors.
var w = eb.build({ country: "uk", services: ["books", "payroll", "mgmt"], fees: { books: "100" }, start: "2026-11-01" });
ok("warn volume", w.warnings.some(function (x) { return /transaction volume/.test(x); }));
ok("warn employees", w.warnings.some(function (x) { return /number of employees/.test(x); }));
ok("warn missing fee", w.warnings.some(function (x) { return /No fee entered for Payroll/.test(x); }));
ok("placeholder volume", w.schedules[0].based.indexOf("[number]") >= 0);
ok("missing fee shown", w.text.indexOf("Payroll: [fee]") >= 0);
eq("bad fee warns", eb.build({ country: "uk", services: ["books"], fees: { books: "abc" }, start: "2026-11-01", transactions: 1, accounts: 1 }).warnings, ["The fee for Monthly bookkeeping isn't a number."]);
eq("no services", eb.build({ country: "uk", services: [], start: "2026-11-01" }).error, "Tick at least one service.");
eq("us-only on uk", eb.build({ country: "uk", services: ["salestax"], start: "2026-11-01" }).error, "Tick at least one service.");
eq("no start", eb.build({ country: "uk", services: ["books"] }).error, "Enter the start date.");
eq("bad due", eb.build({ country: "uk", services: ["books"], start: "2026-11-01", dueDay: "31" }).error, "Records-due day must be a whole number from 1 to 28.");
eq("frac due", eb.build({ country: "uk", services: ["books"], start: "2026-11-01", dueDay: "7.5" }).error, "Records-due day must be a whole number from 1 to 28.");
ok("query mins", eb.build({ country: "uk", services: ["books"], start: "2026-11-01", queryMinutes: "45" }).clauses[1].t.indexOf("45 minutes") >= 0);

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
