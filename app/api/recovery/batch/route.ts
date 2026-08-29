import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

type PaymentStatus =
  | "AT_RISK"
  | "RECOVERED"
  | "ESCALATED";

type Payment = {
  id: string;
  customer: string;
  amount: number;
  failure: string;
  attempts: number;
  probability?: number;
  strategy?: string;
  status?: PaymentStatus;
  reason?: string;
};

type Diagnosis = {
  probability: number;
  strategy: string;
  reason: string;
};

type PolicyResult = {
  allowed: boolean;
  reason: string;
};

type AuditStep = {
  step: string;
  timestamp: string;
  message: string;
};

type RecoveryResult = {
  id: string;
  customer: string;
  amount: number;
  probability: number;
  strategy: string;
  status:
    | "RECOVERED"
    | "AT_RISK"
    | "ESCALATED";
  recovered: boolean;
  amountRecovered: number;
  reason: string;
  audit: AuditStep[];
};

/* =========================================================
   SUPABASE SERVER CLIENT
   ========================================================= */

async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },

        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(
              ({ name, value, options }) => {
                cookieStore.set(
                  name,
                  value,
                  options
                );
              }
            );
          } catch {
            // Safe to ignore when cookies cannot
            // be modified in this context.
          }
        },
      },
    }
  );
}

/* =========================================================
   AI DIAGNOSIS
   ========================================================= */

function diagnose(
  payment: Payment
): Diagnosis {
  const failure =
    String(
      payment.failure || ""
    ).toLowerCase();

  if (payment.attempts >= 2) {
    return {
      probability: 18,
      strategy: "Stop & escalate",
      reason:
        "Maximum automated attempts reached. Further retries are blocked by policy.",
    };
  }

  if (
    failure.includes("temporary") ||
    failure.includes("temporarily") ||
    failure.includes("timeout") ||
    failure.includes("timed out")
  ) {
    return {
      probability: 87,
      strategy:
        "Retry after 30 minutes",
      reason:
        "Transient payment failure with a strong recovery signal. A delayed retry minimizes unnecessary customer friction.",
    };
  }

  if (
    failure.includes(
      "insufficient"
    ) ||
    failure.includes(
      "insufficient funds"
    )
  ) {
    return {
      probability: 68,
      strategy:
        "Send payment reminder",
      reason:
        "Insufficient funds should not trigger repeated charges. A reminder allows the customer to resolve the issue.",
    };
  }

  if (
    failure.includes(
      "declined by the bank"
    ) ||
    failure.includes(
      "bank declined"
    ) ||
    failure.includes(
      "payment_failed"
    )
  ) {
    return {
      probability: 55,
      strategy:
        "Send payment reminder",
      reason:
        "The bank declined the payment during authorization. RecoverAI avoids an immediate repeated charge and recommends a customer reminder or alternate payment method.",
    };
  }

  if (
    failure.includes(
      "abandonment"
    ) ||
    failure.includes(
      "abandoned"
    ) ||
    failure.includes(
      "checkout"
    )
  ) {
    return {
      probability: 74,
      strategy:
        "Send payment reminder",
      reason:
        "Checkout abandonment indicates purchase intent. A reminder is the lowest-friction recovery action.",
    };
  }

  if (
    failure.includes("failed") ||
    failure.includes("failure") ||
    failure.includes("error")
  ) {
    return {
      probability: 42,
      strategy:
        "Manual verification",
      reason:
        "Payment state is uncertain. RecoverAI requires verification before taking an automated action.",
    };
  }

  return {
    probability: 42,
    strategy:
      "Manual verification",
    reason:
      "Payment state is uncertain. RecoverAI requires verification before taking an automated action.",
  };
}

/* =========================================================
   POLICY ENGINE
   ========================================================= */

function validatePolicy(
  payment: Payment,
  strategy: string
): PolicyResult {
  if (
    payment.status ===
    "RECOVERED"
  ) {
    return {
      allowed: false,
      reason:
        "Payment already recovered. Further automated actions are blocked.",
    };
  }

  if (payment.attempts >= 2) {
    return {
      allowed: false,
      reason:
        "Retry limit reached. Payment escalated safely.",
    };
  }

  if (
    payment.failure
      .toLowerCase()
      .includes("unknown")
  ) {
    return {
      allowed: false,
      reason:
        "Unknown payment state requires manual verification.",
    };
  }

  if (
    strategy ===
    "Stop & escalate"
  ) {
    return {
      allowed: false,
      reason:
        "Recovery action blocked by stopping policy.",
    };
  }

  return {
    allowed: true,
    reason:
      "Action approved by Recovery Policy Engine.",
  };
}

/* =========================================================
   AUDIT LOG
   ========================================================= */

function createAudit(
  payment: Payment,
  diagnosis: Diagnosis,
  policy: PolicyResult,
  recovered: boolean
): AuditStep[] {
  const now = () =>
    new Date().toISOString();

  const audit: AuditStep[] = [
    {
      step:
        "PAYMENT_DETECTED",
      timestamp: now(),
      message:
        `Payment ${payment.id} detected as revenue at risk.`,
    },
    {
      step:
        "AI_DIAGNOSIS",
      timestamp: now(),
      message:
        `${diagnosis.strategy} selected with ${diagnosis.probability}% recovery probability.`,
    },
    {
      step:
        "POLICY_VALIDATION",
      timestamp: now(),
      message:
        policy.reason,
    },
  ];

  if (recovered) {
    audit.push({
      step:
        "RECOVERY_EXECUTED",
      timestamp: now(),
      message:
        "Recovery action executed successfully in sandbox.",
    });

    audit.push({
      step:
        "RECOVERY_RECORDED",
      timestamp: now(),
      message:
        `${payment.amount} recorded as recovered revenue.`,
    });
  } else {
    audit.push({
      step:
        "RECOVERY_STOPPED",
      timestamp: now(),
      message:
        "Automated recovery stopped according to policy.",
    });
  }

  return audit;
}

/* =========================================================
   PAYMENT PROCESSOR
   ========================================================= */

function processPayment(
  payment: Payment
): RecoveryResult {
  const diagnosis =
    diagnose(payment);

  const policy =
    validatePolicy(
      payment,
      diagnosis.strategy
    );

  const recovered =
    policy.allowed &&
    diagnosis.strategy ===
      "Retry after 30 minutes" &&
    diagnosis.probability >= 80;

  const status:
    | "RECOVERED"
    | "AT_RISK"
    | "ESCALATED" =
    recovered
      ? "RECOVERED"
      : policy.allowed
      ? "AT_RISK"
      : "ESCALATED";

  const audit =
    createAudit(
      payment,
      diagnosis,
      policy,
      recovered
    );

  return {
    id: payment.id,
    customer:
      payment.customer,
    amount:
      payment.amount,
    probability:
      diagnosis.probability,
    strategy:
      diagnosis.strategy,
    status,
    recovered,
    amountRecovered:
      recovered
        ? payment.amount
        : 0,
    reason: recovered
      ? "Recovery action succeeded in the sandbox."
      : policy.allowed
      ? "Recovery recommendation generated successfully. Customer action is required."
      : policy.reason,
    audit,
  };
}

/* =========================================================
   INPUT VALIDATION
   ========================================================= */

function isValidPayment(
  payment: unknown
): payment is Payment {
  if (
    !payment ||
    typeof payment !== "object"
  ) {
    return false;
  }

  const p =
    payment as Partial<Payment>;

  return (
    typeof p.id === "string" &&
    p.id.length > 0 &&
    typeof p.customer ===
      "string" &&
    typeof p.amount ===
      "number" &&
    Number.isFinite(
      p.amount
    ) &&
    p.amount >= 0 &&
    typeof p.failure ===
      "string" &&
    typeof p.attempts ===
      "number" &&
    Number.isFinite(
      p.attempts
    ) &&
    p.attempts >= 0
  );
}

/* =========================================================
   POST /api/recovery/batch
   ========================================================= */

export async function POST(
  request: Request
) {
  try {
    // --------------------------------------------------
    // 1. CHECK AUTHENTICATION
    // --------------------------------------------------

    const supabase =
      await createSupabaseServerClient();

    const {
      data: { user },
      error: authError,
    } =
      await supabase.auth.getUser();

    if (
      authError ||
      !user
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Unauthorized",
        },
        {
          status: 401,
        }
      );
    }

    // --------------------------------------------------
    // 2. READ REQUEST
    // --------------------------------------------------

    const body =
      await request.json();

    /*
     * Supported format:
     *
     * {
     *   "payments": [...]
     * }
     *
     * A single payment object is also accepted.
     */

    let payments: Payment[] =
      [];

    if (
      body &&
      Array.isArray(
        body.payments
      )
    ) {
      payments =
        body.payments;
    } else if (
      isValidPayment(body)
    ) {
      payments = [body];
    }

    // --------------------------------------------------
    // 3. VALIDATE PAYMENTS
    // --------------------------------------------------

    if (
      payments.length === 0
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "payments must be a non-empty array of valid payment objects.",
        },
        {
          status: 400,
        }
      );
    }

    const invalidPayment =
      payments.find(
        (payment) =>
          !isValidPayment(
            payment
          )
      );

    if (invalidPayment) {
      return NextResponse.json(
        {
          success: false,
          error:
            "One or more payment objects are invalid.",
        },
        {
          status: 400,
        }
      );
    }

    // --------------------------------------------------
    // 4. PROCESS PAYMENTS
    // --------------------------------------------------

    const results =
      payments.map(
        processPayment
      );

    // --------------------------------------------------
    // 5. REVENUE AT RISK
    // --------------------------------------------------

    const revenueAtRisk =
      payments.reduce(
        (sum, payment) =>
          sum + payment.amount,
        0
      );

    // --------------------------------------------------
    // 6. REVENUE RECOVERED
    // --------------------------------------------------

    const revenueRecovered =
      results.reduce(
        (sum, result) =>
          sum +
          result.amountRecovered,
        0
      );

    // --------------------------------------------------
    // 7. COUNTS
    // --------------------------------------------------

    const recoveredCount =
      results.filter(
        (result) =>
          result.recovered
      ).length;

    const escalatedCount =
      results.filter(
        (result) =>
          result.status ===
          "ESCALATED"
      ).length;

    const pendingCount =
      results.filter(
        (result) =>
          result.status ===
          "AT_RISK"
      ).length;

    // --------------------------------------------------
    // 8. RECOVERY RATE
    // --------------------------------------------------

    const recoveryRate =
      revenueAtRisk > 0
        ? Number(
            (
              (revenueRecovered /
                revenueAtRisk) *
              100
            ).toFixed(1)
          )
        : 0;

    // --------------------------------------------------
    // 9. LOG
    // --------------------------------------------------

    console.log(
      "================================="
    );

    console.log(
      "RECOVERAI BATCH RECOVERY"
    );

    console.log(
      "================================="
    );

    console.log({
      userId: user.id,
      totalPayments:
        payments.length,
      revenueAtRisk,
      revenueRecovered,
      recoveryRate,
      recoveredCount,
      escalatedCount,
      pendingCount,
    });

    console.log(
      "================================="
    );

    // --------------------------------------------------
    // 10. RESPONSE
    // --------------------------------------------------

    return NextResponse.json({
      success: true,

      batch: {
        totalPayments:
          payments.length,

        revenueAtRisk,

        revenueRecovered,

        recoveryRate,

        recoveredCount,

        escalatedCount,

        pendingCount,
      },

      results,
    });
  } catch (error) {
    console.error(
      "Batch recovery error:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          "Unable to process batch recovery.",
      },
      {
        status: 500,
      }
    );
  }
}