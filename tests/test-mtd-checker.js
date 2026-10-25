const m = require(process.argv[2] || '../docs/guides/mtd-checker.js'); let n=0,f=0;
function eq(a,b,msg){n++; if(JSON.stringify(a)!==JSON.stringify(b)){f++;console.log('FAIL',msg,a,b);}}
const D=(s)=>new Date(s+'T12:00:00Z');
// gov.uk example: £25,000 rent + £27,000 self-employment = £52,000 in 24/25 -> 2026
eq(m.mtdStart({y2425:52000}).start,2026,'govuk example 52k');
eq(m.mtdStart({y2425:50000}).start,null,'exactly 50k is not over');
eq(m.mtdStart({y2425:50000,y2526:30001}).start,2027,'30,001 in 25/26 -> 2027');
eq(m.mtdStart({y2425:'45,000',y2526:'£30,000',y2627:20001}).start,2028,'strings, 2028');
eq(m.mtdStart({y2425:60000,y2526:10000}).start,2026,'first phase wins');
eq(m.mtdStart({y2425:10000,y2526:10000,y2627:20000}).start,null,'all under');
eq(m.mtdStart({y2425:10000}).unknown,true,'unknown later years');
eq(!!m.mtdStart({}).error,true,'empty');
eq(!!m.mtdStart({y2425:'abc'}).error,true,'NaN');
// Deadlines
let u=m.nextUpdate(D('2026-10-25'),2026); eq([u.q,m.fmt(u.deadline),u.days,u.points,u.std],[2,'7 November 2026',13,false,'6 April to 5 October 2026'],'Q2 26/27');
u=m.nextUpdate(D('2026-11-07'),2026); eq([u.q,u.days],[2,0],'deadline day itself');
u=m.nextUpdate(D('2026-11-08'),2026); eq([u.q,m.fmt(u.deadline),u.std],[3,'7 February 2027','6 April 2026 to 5 January 2027'],'Q3');
u=m.nextUpdate(D('2027-04-20'),2026); eq([u.q,u.taxYear,m.fmt(u.deadline),u.points],[4,2026,'7 May 2027',false],'Q4 after new year starts');
u=m.nextUpdate(D('2027-05-08'),2026); eq([u.q,u.taxYear,m.fmt(u.deadline),u.points],[1,2027,'7 August 2027',true],'27/28 Q1 points');
u=m.nextUpdate(D('2026-10-25'),2027); eq([u.q,u.taxYear,m.fmt(u.deadline),u.notStarted,u.points],[1,2027,'7 August 2027',true,true],'2027 starter');
u=m.nextUpdate(D('2026-10-25'),2028); eq([u.taxYear,m.fmt(u.deadline)],[2028,'7 August 2028'],'2028 starter');
// Returns
let r=m.nextReturn(D('2026-10-25'),2026); eq([r.label,m.fmt(r.due),r.viaMtd],['2025 to 2026','31 January 2027',false],'25/26 return old way');
r=m.nextReturn(D('2027-01-31'),2026); eq([r.label,r.viaMtd],['2025 to 2026',false],'on 31 Jan');
r=m.nextReturn(D('2027-02-01'),2026); eq([r.label,m.fmt(r.due),r.viaMtd],['2026 to 2027','31 January 2028',true],'26/27 via MTD');
r=m.nextReturn(D('2027-02-01'),2027); eq(r.viaMtd,false,'2027 starter files 26/27 old way');
console.log(`${n-f}/${n} passed`); process.exit(f?1:0);
