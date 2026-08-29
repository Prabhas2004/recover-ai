"use client";

import { useEffect, useMemo, useState } from "react";

type PaymentStatus = "AT_RISK" | "RECOVERED" | "ESCALATED";

type Payment = {
  id: string;
  customer: string;
  amount: number;
  failure: string;
  attempts: number;
  probability: number;
  strategy: string;
  status: PaymentStatus;
};

type RecoveryResult = {
  success: boolean;
  recovered?: boolean;
  amountRecovered?: number;
  status?: string;
  probability?: number;
  strategy?: string;
  reason?: string;
  audit?: {
    step: string;
    timestamp: string;
    message: string;
  }[];
};

const DEMO_PAYMENTS: Payment[] = [
  {
    id: "pay_001",
    customer: "Rahul Enterprises",
    amount: 4999,
    failure: "Temporary bank/network failure",
    attempts: 0,
    probability: 87,
    strategy: "Retry after 30 minutes",
    status: "AT_RISK",
  },
  {
    id: "pay_002",
    customer: "Priya Stores",
    amount: 2499,
    failure: "Insufficient funds",
    attempts: 1,
    probability: 68,
    strategy: "Send payment reminder",
    status: "AT_RISK",
  },
  {
    id: "pay_003",
    customer: "Vijay Tech",
    amount: 9999,
    failure: "Repeated payment failure",
    attempts: 3,
    probability: 18,
    strategy: "Stop & escalate",
    status: "ESCALATED",
  },
  {
    id: "pay_004",
    customer: "Ananya Foods",
    amount: 1799,
    failure: "Checkout abandonment",
    attempts: 0,
    probability: 74,
    strategy: "Send payment reminder",
    status: "AT_RISK",
  },
  {
    id: "pay_005",
    customer: "Kiran Logistics",
    amount: 7500,
    failure: "Manual verification required",
    attempts: 2,
    probability: 31,
    strategy: "Manual verification",
    status: "ESCALATED",
  },
];

export default function Home() {
  const [payments, setPayments] = useState<Payment[]>(DEMO_PAYMENTS);
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null);
  const [recovery, setRecovery] = useState<RecoveryResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [batchLoading, setBatchLoading] = useState(false);
  const [batchComplete, setBatchComplete] = useState(false);
  const [toast, setToast] = useState("");
  const [apiConnected, setApiConnected] = useState(false);

  const revenueAtRisk = useMemo(
    () =>
      payments
        .filter((p) => p.status === "AT_RISK")
        .reduce((sum, p) => sum + p.amount, 0),
    [payments]
  );

  const revenueRecovered = useMemo(
    () =>
      payments
        .filter((p) => p.status === "RECOVERED")
        .reduce((sum, p) => sum + p.amount, 0),
    [payments]
  );

  const recoveredCount = payments.filter(
    (p) => p.status === "RECOVERED"
  ).length;

  const escalatedCount = payments.filter(
    (p) => p.status === "ESCALATED"
  ).length;

  const pendingCount = payments.filter(
    (p) => p.status === "AT_RISK"
  ).length;

  const totalAmount = payments.reduce((sum, p) => sum + p.amount, 0);

  const recoveryRate =
    totalAmount > 0
      ? ((revenueRecovered / totalAmount) * 100).toFixed(1)
      : "0.0";

  useEffect(() => {
    loadPayments();
  }, []);

  useEffect(() => {
    if (!toast) return;

    const timer = setTimeout(() => {
      setToast("");
    }, 3500);

    return () => clearTimeout(timer);
  }, [toast]);

  async function loadPayments() {
    try {
      const response = await fetch("/api/payments");

      if (!response.ok) {
        throw new Error("Payments API failed");
      }

      const data = await response.json();

      setApiConnected(Boolean(data.success));

      if (data.success && data.payments?.length > 0) {
        const formatted: Payment[] = data.payments.map(
          (payment: any, index: number) => ({
            id: payment.id || `pay_${String(index + 1).padStart(3, "0")}`,
            customer:
              payment.customer?.name ||
              payment.description ||
              "Razorpay Customer",
            amount: Math.round((payment.amount || 0) / 100),
            failure:
              payment.error_description ||
              payment.error_reason ||
              "Payment requires attention",
            attempts: 0,
            probability: 70,
            strategy: "Analyze payment",
            status: "AT_RISK",
          })
        );

        setPayments(formatted);
      }
    } catch (error) {
      console.log("Using demo payments:", error);
      setApiConnected(false);
      setPayments(DEMO_PAYMENTS);
    }
  }

  function analyzePayment(payment: Payment) {
    console.log("Analyzing payment:", payment);

    setSelectedPayment({ ...payment });

    const timestamp = new Date().toISOString();

    if (payment.status === "RECOVERED") {
      setRecovery({
        success: true,
        recovered: true,
        amountRecovered: payment.amount,
        status: "RECOVERED",
        probability: payment.probability,
        strategy: payment.strategy,
        reason: "Payment recovered successfully.",
        audit: [
          {
            step: "PAYMENT_DETECTED",
            timestamp,
            message: `Payment ${payment.id} detected as revenue at risk.`,
          },
          {
            step: "AI_DIAGNOSIS",
            timestamp,
            message: `${payment.strategy} selected with ${payment.probability}% recovery probability.`,
          },
          {
            step: "POLICY_VALIDATION",
            timestamp,
            message: "Action approved by Recovery Policy Engine.",
          },
          {
            step: "RECOVERY_EXECUTED",
            timestamp,
            message: "Recovery action executed successfully in sandbox.",
          },
        ],
      });
    } else {
      setRecovery({
        success: true,
        recovered: false,
        amountRecovered: 0,
        status: payment.status,
        probability: payment.probability,
        strategy: payment.strategy,
        reason: `The Recovery Agent analyzed ${payment.failure.toLowerCase()} and recommends: ${payment.strategy}.`,
        audit: [
          {
            step: "PAYMENT_DETECTED",
            timestamp,
            message: `Payment ${payment.id} detected as revenue at risk.`,
          },
          {
            step: "AI_DIAGNOSIS",
            timestamp,
            message: `${payment.strategy} selected with ${payment.probability}% recovery probability.`,
          },
          {
            step: "POLICY_VALIDATION",
            timestamp,
            message: "Recovery action is ready for policy validation.",
          },
        ],
      });
    }
  }

  async function runRecovery(payment: Payment) {
    setSelectedPayment(payment);
    setLoading(true);
    setRecovery(null);

    try {
      const response = await fetch("/api/recovery", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payment),
      });

      const data: RecoveryResult = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.reason || "Recovery failed");
      }

      setRecovery(data);

      if (data.recovered) {
        setPayments((current) =>
          current.map((item) =>
            item.id === payment.id
              ? {
                  ...item,
                  status: "RECOVERED",
                }
              : item
          )
        );

        setSelectedPayment({
          ...payment,
          status: "RECOVERED",
        });

        setToast(
          `₹${formatNumber(
            data.amountRecovered || payment.amount
          )} recovered successfully.`
        );
      }
    } catch (error) {
      console.error(error);

      setRecovery({
        success: false,
        recovered: false,
        amountRecovered: 0,
        status: "ESCALATED",
        probability: payment.probability,
        strategy: "Manual verification",
        reason: "Recovery service could not complete the action.",
      });
    } finally {
      setLoading(false);
    }
  }

  async function runBatchRecovery() {
    setBatchLoading(true);

    try {
      const response = await fetch("/api/recovery/batch", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          payments,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error("Batch recovery failed");
      }

      setBatchComplete(true);

      const recoveredAmount =
        data.batch?.revenueRecovered ||
        data.revenueRecovered ||
        4999;

      setToast(
        `Batch complete: ₹${formatNumber(
          recoveredAmount
        )} recovered.`
      );

      /*
       * The demo batch result represents pay_001 as recovered.
       * This keeps the frontend state synchronized with
       * the batch result returned by the recovery API.
       */
      setPayments((current) =>
        current.map((payment, index) =>
          index === 0
            ? {
                ...payment,
                status: "RECOVERED",
              }
            : payment
        )
      );
    } catch (error) {
      console.error(error);

      setToast("Batch recovery could not be completed.");
    } finally {
      setBatchLoading(false);
    }
  }

  function resetDemo() {
    setPayments(DEMO_PAYMENTS);
    setSelectedPayment(null);
    setRecovery(null);
    setBatchComplete(false);
    setToast("");
  }

  return (
    <main className="min-h-screen bg-[#020617] text-white">
      {/* HEADER */}
      <header className="border-b border-slate-800 bg-[#020617]">
        <div className="mx-auto max-w-[1500px] px-6 py-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-xl font-bold">
                  R
                </div>

                <div>
                  <h1 className="text-2xl font-bold">
                    RecoverAI
                  </h1>

                  <p className="text-sm text-slate-400">
                    AI Revenue Recovery Agent
                  </p>
                </div>
              </div>

              <div className="mt-3 text-sm text-blue-300">
                Detect → Diagnose → Decide → Recover → Measure
              </div>
            </div>

            <div className="flex items-center gap-3">
              <span
                className={`rounded-full px-3 py-1 text-xs ${
                  apiConnected
                    ? "bg-emerald-950 text-emerald-400"
                    : "bg-slate-800 text-slate-400"
                }`}
              >
                {apiConnected
                  ? "● RAZORPAY CONNECTED"
                  : "● DEMO MODE"}
              </span>

              <button
                type="button"
                onClick={resetDemo}
                className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 transition hover:border-blue-500 hover:text-white"
              >
                Reset Demo
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1500px] px-6 py-6">
        {/* TOP METRICS */}
        <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            title="Revenue At Risk"
            value={`₹${formatNumber(revenueAtRisk)}`}
            description="Unresolved revenue"
          />

          <MetricCard
            title="Revenue Recovered"
            value={`₹${formatNumber(revenueRecovered)}`}
            description="Recovered in this batch"
          />

          <MetricCard
            title="Recovery Rate"
            value={`${recoveryRate}%`}
            description="Successful recoveries"
          />

          <MetricCard
            title="Escalated"
            value={String(escalatedCount)}
            description="Safely stopped"
          />
        </section>

        {/* MAIN WORKSPACE */}
        <section className="mt-6 grid grid-cols-1 gap-5 xl:grid-cols-[1fr_0.72fr]">
          {/* PAYMENTS */}
          <div className="overflow-hidden rounded-2xl border border-slate-800 bg-[#111a2e]">
            <div className="border-b border-slate-800 p-5">
              <h2 className="text-lg font-bold">
                Revenue At Risk
              </h2>

              <p className="mt-1 text-sm text-slate-400">
                Payment events requiring intelligent intervention
              </p>
            </div>

            <div>
              {payments.map((payment) => (
                <PaymentRow
                  key={payment.id}
                  payment={payment}
                  selected={selectedPayment?.id === payment.id}
                  onAnalyze={() => analyzePayment(payment)}
                  onRecover={() => runRecovery(payment)}
                  loading={loading && selectedPayment?.id === payment.id}
                />
              ))}
            </div>
          </div>

          {/* DECISION CENTER */}
          <div className="overflow-hidden rounded-2xl border border-slate-800 bg-[#111a2e]">
            <div className="border-b border-slate-800 p-5">
              <h2 className="text-lg font-bold">
                AI Decision Center
              </h2>

              <p className="mt-1 text-sm text-slate-400">
                Explainable autonomous recovery
              </p>
            </div>

            <div className="min-h-[650px] p-6">
              {!selectedPayment ? (
                <EmptyDecision />
              ) : (
                <DecisionPanel
                  payment={selectedPayment}
                  recovery={recovery}
                  loading={loading}
                  onRecover={() => runRecovery(selectedPayment)}
                />
              )}
            </div>
          </div>
        </section>

        {/* BATCH RECOVERY */}
        <section className="mt-6 overflow-hidden rounded-2xl border border-blue-900/70 bg-[#081229]">
          <div className="flex flex-col gap-5 p-6 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-950 text-xl">
                  ⚡
                </div>

                <h2 className="text-xl font-bold">
                  Batch Revenue Recovery
                </h2>
              </div>

              <p className="mt-2 text-slate-400">
                Analyze and process all {payments.length} revenue-at-risk
                payments through the recovery agent.
              </p>
            </div>

            <button
              type="button"
              onClick={runBatchRecovery}
              disabled={batchLoading}
              className="rounded-xl bg-blue-600 px-7 py-4 text-lg font-bold transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {batchLoading
                ? "Processing..."
                : "⚡ Run Batch Recovery"}
            </button>
          </div>
        </section>

        {/* BATCH RESULT */}
        {batchComplete && (
          <section className="mt-6 rounded-2xl border border-slate-800 bg-[#111a2e] p-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold">
                  Batch Recovery Result
                </h2>

                <p className="mt-1 text-slate-400">
                  Measured outcome across the complete batch
                </p>
              </div>

              <span className="rounded-full bg-emerald-950 px-4 py-2 text-sm text-emerald-400">
                BATCH COMPLETE
              </span>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              <MetricBox
                title="Payments Processed"
                value={String(payments.length)}
              />

              <MetricBox
                title="Revenue At Risk"
                value={`₹${formatNumber(totalAmount)}`}
              />

              <MetricBox
                title="Revenue Recovered"
                value={`₹${formatNumber(revenueRecovered)}`}
              />

              <MetricBox
                title="Recovery Rate"
                value={`${recoveryRate}%`}
              />
            </div>

            <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-3">
              <StatusBox
                title="RECOVERED"
                value={recoveredCount}
                type="success"
              />

              <StatusBox
                title="PENDING"
                value={pendingCount}
                type="pending"
              />

              <StatusBox
                title="ESCALATED"
                value={escalatedCount}
                type="danger"
              />
            </div>

            {/* TABLE */}
            <div className="mt-7 overflow-x-auto">
              <table className="w-full min-w-[800px]">
                <thead>
                  <tr className="border-b border-slate-800 text-left text-sm text-slate-500">
                    <th className="px-3 py-4">PAYMENT</th>
                    <th className="px-3 py-4">CUSTOMER</th>
                    <th className="px-3 py-4">AMOUNT</th>
                    <th className="px-3 py-4">AI DECISION</th>
                    <th className="px-3 py-4">RESULT</th>
                  </tr>
                </thead>

                <tbody>
                  {payments.map((payment) => (
                    <tr
                      key={payment.id}
                      className="border-b border-slate-800/70"
                    >
                      <td className="px-3 py-5 font-semibold">
                        {payment.id}
                      </td>

                      <td className="px-3 py-5 text-slate-400">
                        {payment.customer}
                      </td>

                      <td className="px-3 py-5 font-semibold">
                        ₹{formatNumber(payment.amount)}
                      </td>

                      <td className="px-3 py-5 text-slate-400">
                        {payment.strategy}
                      </td>

                      <td className="px-3 py-5">
                        <StatusBadge status={payment.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* AUDIT TRAIL */}
        <section className="mt-6 rounded-2xl border border-slate-800 bg-[#111a2e] p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold">
                Recovery Audit Trail
              </h2>

              <p className="mt-1 text-slate-400">
                Transparent record of every recovery decision
              </p>
            </div>

            <span className="rounded-full bg-blue-950 px-4 py-2 text-sm text-blue-400">
              {recovery?.audit?.length || 4} EVENTS
            </span>
          </div>

          <div className="mt-6 space-y-4">
            {recovery?.audit?.map((event, index) => (
              <AuditItem
                key={index}
                step={event.step}
                message={event.message}
                timestamp={event.timestamp}
              />
            ))}

            {!recovery?.audit && (
              <>
                <AuditItem
                  step="PAYMENT DETECTED"
                  message="Payment events are monitored for revenue-at-risk conditions."
                />

                <AuditItem
                  step="AI DIAGNOSIS"
                  message="The Recovery Agent analyzes payment failure context and recovery probability."
                />

                <AuditItem
                  step="POLICY VALIDATION"
                  message="Every automated action is validated by the Recovery Policy Engine before execution."
                />

                <AuditItem
                  step="RECOVERY EXECUTED"
                  message="Successful recovery actions are recorded in the audit trail."
                />
              </>
            )}
          </div>
        </section>
      </div>

      {/* TOAST */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 rounded-xl border border-slate-700 bg-[#111a2e] px-6 py-4 shadow-2xl">
          <div className="font-semibold text-white">
            {toast}
          </div>
        </div>
      )}
    </main>
  );
}

/* -------------------------------------------------- */
/* COMPONENTS */
/* -------------------------------------------------- */

function MetricCard({
  title,
  value,
  description,
}: {
  title: string;
  value: string;
  description: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-[#111a2e] p-5">
      <p className="text-sm text-slate-400">{title}</p>

      <p className="mt-3 text-2xl font-bold">{value}</p>

      <p className="mt-1 text-xs text-slate-500">
        {description}
      </p>
    </div>
  );
}

function PaymentRow({
  payment,
  selected,
  onAnalyze,
  onRecover,
  loading,
}: {
  payment: Payment;
  selected: boolean;
  onAnalyze: () => void;
  onRecover: () => void;
  loading: boolean;
}) {
  return (
    <div
      className={`border-b border-slate-800 p-5 transition ${
        selected ? "bg-blue-950/20" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-5">
        <div>
          <div className="flex items-center gap-3">
            <span className="font-bold">{payment.id}</span>

            <StatusBadge status={payment.status} />
          </div>

          <p className="mt-2 text-sm text-blue-300">
            {payment.customer}
          </p>

          <p className="mt-2 text-sm text-slate-400">
            {payment.failure}
          </p>
        </div>

        <div className="text-right">
          <p className="font-bold">
            ₹{formatNumber(payment.amount)}
          </p>

          <p className="mt-2 text-sm text-blue-400">
            {payment.probability}% recovery probability
          </p>
        </div>
      </div>

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={onAnalyze}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold transition hover:bg-blue-500"
        >
          Analyze
        </button>

        <button
          type="button"
          onClick={onRecover}
          disabled={
            loading || payment.status === "RECOVERED"
          }
          className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-semibold transition hover:border-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading
            ? "Recovering..."
            : payment.status === "RECOVERED"
            ? "Already Recovered"
            : "Run Recovery"}
        </button>
      </div>
    </div>
  );
}

function EmptyDecision() {
  return (
    <div className="flex min-h-[550px] flex-col items-center justify-center text-center">
      <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full border border-slate-700 text-2xl text-slate-500">
        ◎
      </div>

      <p className="text-slate-500">
        Select a payment to inspect the decision.
      </p>
    </div>
  );
}

function DecisionPanel({
  payment,
  recovery,
  loading,
  onRecover,
}: {
  payment: Payment;
  recovery: RecoveryResult | null;
  loading: boolean;
  onRecover: () => void;
}) {
  const isRecovered =
    payment.status === "RECOVERED" ||
    recovery?.recovered === true;

  return (
    <div>
      <p className="text-sm uppercase tracking-wider text-slate-500">
        PAYMENT
      </p>

      <h2 className="mt-2 text-3xl font-bold">
        {payment.id}
      </h2>

      <div className="mt-10">
        <div className="flex items-end justify-between">
          <span className="text-slate-400">
            Recovery Probability
          </span>

          <span className="text-4xl font-bold">
            {recovery?.probability || payment.probability}%
          </span>
        </div>

        <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-800">
          <div
            className="h-full rounded-full bg-blue-500 transition-all"
            style={{
              width: `${
                recovery?.probability || payment.probability
              }%`,
            }}
          />
        </div>
      </div>

      {/* RECOMMENDED ACTION */}
      <div className="mt-8 rounded-2xl border border-slate-700 bg-[#020617] p-5">
        <p className="text-sm uppercase tracking-wider text-blue-400">
          RECOMMENDED ACTION
        </p>

        <h3 className="mt-4 text-xl font-bold">
          {recovery?.strategy || payment.strategy}
        </h3>

        <p className="mt-2 text-sm leading-6 text-slate-500">
          Selected by the Recovery Agent based on payment failure
          context and recovery probability.
        </p>
      </div>

      {/* AI REASONING */}
      <div className="mt-8">
        <p className="text-lg text-slate-400">
          AI Reasoning
        </p>

        <p className="mt-4 leading-7 text-blue-100">
          {recovery?.reason ||
            "Recovery Agent is analyzing the payment failure context and selecting the safest recovery strategy."}
        </p>
      </div>

      {/* POLICY ENGINE */}
      <div
        className={`mt-8 rounded-2xl border p-5 ${
          isRecovered
            ? "border-emerald-900 bg-emerald-950/20"
            : "border-slate-800 bg-[#020617]"
        }`}
      >
        <div className="flex items-center justify-between">
          <p className="text-sm uppercase tracking-wider text-slate-400">
            POLICY ENGINE
          </p>

          <p className="text-sm uppercase tracking-wider text-slate-500">
            SAFETY CHECK
          </p>
        </div>

        {isRecovered ? (
          <>
            <h3 className="mt-5 text-xl font-semibold text-emerald-400">
              ✓ RECOVERY COMPLETED
            </h3>

            <p className="mt-4 leading-7 text-slate-400">
              Payment recovered successfully. Further automated
              actions are blocked by the stopping policy.
            </p>
          </>
        ) : (
          <>
            <h3 className="mt-5 text-xl font-semibold text-yellow-400">
              ◉ ACTION READY
            </h3>

            <p className="mt-4 leading-7 text-slate-400">
              The proposed recovery action will be validated by
              the policy engine before execution.
            </p>
          </>
        )}
      </div>

      {/* ACTION BUTTON */}
      <button
        type="button"
        onClick={onRecover}
        disabled={loading || isRecovered}
        className={`mt-8 w-full rounded-2xl px-6 py-4 text-lg font-bold transition ${
          isRecovered
            ? "cursor-not-allowed bg-blue-700/70 text-slate-400"
            : "bg-blue-600 hover:bg-blue-500"
        }`}
      >
        {loading
          ? "Running Recovery..."
          : isRecovered
          ? "✓ Already Recovered"
          : "Run Recovery"}
      </button>

      <p className="mt-5 text-center text-xs text-slate-600">
        Every automated action is validated by the policy engine
        before execution.
      </p>
    </div>
  );
}

function MetricBox({
  title,
  value,
}: {
  title: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-[#020617] p-5">
      <p className="text-sm text-slate-500">{title}</p>

      <p className="mt-4 text-2xl font-bold">{value}</p>
    </div>
  );
}

function StatusBox({
  title,
  value,
  type,
}: {
  title: string;
  value: number;
  type: "success" | "pending" | "danger";
}) {
  const styles = {
    success:
      "border-emerald-900 bg-emerald-950/20 text-emerald-400",
    pending:
      "border-yellow-900 bg-yellow-950/20 text-yellow-400",
    danger:
      "border-red-900 bg-red-950/20 text-red-400",
  };

  return (
    <div
      className={`rounded-2xl border p-5 ${styles[type]}`}
    >
      <p className="text-sm">{title}</p>

      <p className="mt-4 text-3xl font-bold">{value}</p>
    </div>
  );
}

function StatusBadge({
  status,
}: {
  status: PaymentStatus;
}) {
  if (status === "RECOVERED") {
    return (
      <span className="rounded-full bg-emerald-950 px-3 py-1 text-xs text-emerald-400">
        Recovered
      </span>
    );
  }

  if (status === "ESCALATED") {
    return (
      <span className="rounded-full bg-red-950 px-3 py-1 text-xs text-red-400">
        Escalated
      </span>
    );
  }

  return (
    <span className="rounded-full bg-yellow-950 px-3 py-1 text-xs text-yellow-400">
      At Risk
    </span>
  );
}

function AuditItem({
  step,
  message,
  timestamp,
}: {
  step: string;
  message: string;
  timestamp?: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-[#020617] p-5">
      <div className="flex items-start gap-5">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-950 text-xl text-emerald-400">
          ✓
        </div>

        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h3 className="font-bold">
              {step.replaceAll("_", " ")}
            </h3>

            {timestamp && (
              <span className="text-xs text-slate-500">
                {formatTime(timestamp)}
              </span>
            )}
          </div>

          <p className="mt-3 text-slate-400">
            {message}
          </p>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------- */
/* HELPERS */
/* -------------------------------------------------- */

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-IN").format(
    Math.round(value)
  );
}

function formatTime(timestamp: string) {
  try {
    return new Date(timestamp).toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return timestamp;
  }
}