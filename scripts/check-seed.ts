import { generateFailedPaymentBatch } from "../lib/simulation/generate";

const a = generateFailedPaymentBatch(42, 100);
const b = generateFailedPaymentBatch(42, 100);
const c = generateFailedPaymentBatch(7, 100);

const idsA = a.payments.map((p) => `${p.id}:${p.amountPaise}:${p.customerId}`);
const idsB = b.payments.map((p) => `${p.id}:${p.amountPaise}:${p.customerId}`);
const same = idsA.join("|") === idsB.join("|");
const different = a.payments[0]!.id !== c.payments[0]!.id || a.payments[0]!.amountPaise !== c.payments[0]!.amountPaise;

if (!same) {
  console.error("FAIL: seed 42 is not deterministic");
  process.exit(1);
}
if (!different) {
  console.error("FAIL: different seeds produced identical first payment");
  process.exit(1);
}

const valueAtRisk = a.payments.reduce((s, p) => s + p.amountPaise, 0);
console.log(
  JSON.stringify(
    {
      ok: true,
      count: a.payments.length,
      firstId: a.payments[0]!.id,
      valueAtRiskPaise: valueAtRisk,
      strategies: [...new Set(a.payments.map((p) => p.assignedStrategy))],
    },
    null,
    2,
  ),
);
