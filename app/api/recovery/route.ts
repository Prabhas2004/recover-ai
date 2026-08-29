import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type Payment = {
  id: string;
  customer: string;
  amount: number;
  failure: string;
  attempts: number;
  probability?: number;
  strategy?: string;
  status: "AT_RISK" | "RECOVERED" | "ESCALATED";
};

type Diagnosis = {
  probability: number;
  strategy: string;
  reason: string;
};

type AuditEntry = {
  step: string;
  timestamp: string;
  message: string;
};

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;

  if (!url || !key) {
    throw new Error(
      "SUPABASE_URL or SUPABASE_SECRET_KEY is missing from .env.local"
    );
  }

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function analyze(payment: Payment): Diagnosis {
  const failure = payment.failure.toLowerCase();

  if (payment.attempts >= 2) {
    return {
      probability: 18,
      strategy: "Stop & escalate",
      reason:
        "Maximum automated attempts reached. Further recovery attempts are blocked by policy.",
    };
  }

  if (
    failure.includes("temporary") ||
    failure.includes("temporarily") ||
    failure.includes("try again later")
  ) {
    return {
      probability: 87,
      strategy: "Retry after 30 minutes",
      reason:
        "The payment failure appears temporary. A delayed retry gives the payment a strong chance of succeeding without immediately charging the customer again.",
    };
  }

  if (
    failure.includes("insufficient") ||
    failure.includes("insufficient funds")
  ) {
    return {
      probability: 68,
      strategy: "Send payment reminder",
      reason:
        "The payment appears to have failed because of insufficient funds. RecoverAI avoids repeated charges and recommends a payment reminder.",
    };
  }

  if (
    failure.includes("international") ||
    failure.includes("domestic") ||
    failure.includes("international_transaction_not_allowed")
  ) {
    return {
      probability: 76,
      strategy: "Suggest alternate payment method",
      reason:
        "The payment was attempted with an international card while the business accepts domestic cards. RecoverAI recommends an alternate supported payment method.",
    };
  }

  if (
    failure.includes("declined by the bank") ||
    failure.includes("bank declined") ||
    failure.includes("declined")
  ) {
    return {
      probability: 55,
      strategy: "Send payment reminder",
      reason:
        "The bank declined the payment during authorization. RecoverAI avoids an immediate repeated charge and recommends a customer reminder or alternate payment method.",
    };
  }

  if (
    failure.includes("authentication") ||
    failure.includes("otp") ||
    failure.includes("3d secure") ||
    failure.includes("3ds")
  ) {
    return {
      probability: 62,
      strategy: "Request payment retry",
      reason:
        "The payment appears to require customer authentication. RecoverAI recommends asking the customer to retry the payment and complete authentication.",
    };
  }

  if (
    failure.includes("payment failed") ||
    failure.includes("authorization")
  ) {
    return {
      probability: 48,
      strategy: "Request payment retry",
      reason:
        "The payment failed during authorization. RecoverAI recommends a controlled customer retry rather than automatically charging again.",
    };
  }

  return {
    probability: 42,
    strategy: "Manual verification",
    reason:
      "The payment state is uncertain. RecoverAI requires verification before taking an automated recovery action.",
  };
}

function validatePolicy(
  payment: Payment,
  diagnosis: Diagnosis
) {
  if (payment.status === "RECOVERED") {
    return {
      allowed: false,
      message:
        "Payment is already recovered. Further automated actions are blocked.",
    };
  }

  if (payment.attempts >= 2) {
    return {
      allowed: false,
      message:
        "Retry limit reached. Payment has been safely escalated.",
    };
  }

  if (diagnosis.strategy === "Stop & escalate") {
    return {
      allowed: false,
      message:
        "Recovery strategy requires escalation.",
    };
  }

  return {
    allowed: true,
    message:
      "Action approved by Recovery Policy Engine.",
  };
}

async function saveRecoveryAttempt(
  payment: Payment,
  diagnosis: Diagnosis,
  policy: ReturnType<typeof validatePolicy>,
  recovered: boolean,
  amountRecovered: number,
  status: "RECOVERED" | "AT_RISK" | "ESCALATED",
  audit: AuditEntry[]
) {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from("recovery_attempts")
    .insert({
      payment_id: payment.id,
      customer: payment.customer,
      amount: payment.amount,
      failure: payment.failure,
      attempts: payment.attempts,
      probability: diagnosis.probability,
      strategy: diagnosis.strategy,
      status,
      recovered,
      amount_recovered: amountRecovered,
      reason: diagnosis.reason,
      policy_allowed: policy.allowed,
      policy_message: policy.message,
      audit,
    })
    .select()
    .single();

  if (error) {
    console.error(
      "SUPABASE SAVE ERROR:",
      error
    );

    throw new Error(
      `Failed to save recovery attempt: ${error.message}`
    );
  }

  return data;
}

export async function POST(request: Request) {
  try {
    const payment =
      (await request.json()) as Payment;

    if (
      !payment?.id ||
      typeof payment.amount !== "number" ||
      !payment?.failure
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid payment payload.",
        },
        { status: 400 }
      );
    }

    const startedAt =
      new Date().toISOString();

    console.log(
      "================================="
    );
    console.log(
      "RECOVERAI PAYMENT ANALYSIS"
    );
    console.log(
      "================================="
    );

    console.log({
      paymentId: payment.id,
      amount: payment.amount,
      failure: payment.failure,
      attempts: payment.attempts,
    });

    // 1. AI diagnosis
    const diagnosis =
      analyze(payment);

    console.log(
      "Diagnosis:",
      diagnosis
    );

    // 2. Policy validation
    const policy =
      validatePolicy(
        payment,
        diagnosis
      );

    console.log(
      "Policy:",
      policy
    );

    // 3. Audit trail
    const audit: AuditEntry[] = [
      {
        step: "PAYMENT_DETECTED",
        timestamp: startedAt,
        message:
          `Payment ${payment.id} detected as revenue at risk.`,
      },
      {
        step: "AI_DIAGNOSIS",
        timestamp:
          new Date().toISOString(),
        message:
          `${diagnosis.strategy} selected with ${diagnosis.probability}% recovery probability.`,
      },
      {
        step: "POLICY_VALIDATION",
        timestamp:
          new Date().toISOString(),
        message:
          policy.message,
      },
    ];

    // 4. Unsafe action
    if (!policy.allowed) {
      audit.push({
        step: "ESCALATED",
        timestamp:
          new Date().toISOString(),
        message:
          "Automated recovery stopped safely according to policy.",
      });

      const saved =
        await saveRecoveryAttempt(
          payment,
          diagnosis,
          policy,
          false,
          0,
          "ESCALATED",
          audit
        );

      console.log(
        "Recovery saved to Supabase:",
        saved.id
      );

      return NextResponse.json({
        success: true,
        recovered: false,
        amountRecovered: 0,
        status: "ESCALATED",
        probability:
          diagnosis.probability,
        strategy:
          diagnosis.strategy,
        reason:
          policy.message,
        audit,
        database: {
          saved: true,
          recordId: saved.id,
        },
      });
    }

    /*
     * DEMO SANDBOX
     *
     * No real customer charge happens here.
     */
    await new Promise(
      (resolve) =>
        setTimeout(resolve, 800)
    );

    /*
     * High-confidence temporary
     * failures are simulated as recovered.
     */
    const recovered =
      diagnosis.strategy ===
        "Retry after 30 minutes" &&
      diagnosis.probability >= 80;

    if (recovered) {
      audit.push({
        step: "RECOVERY_EXECUTED",
        timestamp:
          new Date().toISOString(),
        message:
          "Recovery action executed successfully in sandbox.",
      });

      audit.push({
        step: "REVENUE_RECOVERED",
        timestamp:
          new Date().toISOString(),
        message:
          `${payment.amount} marked as recovered in the demo.`,
      });

      const saved =
        await saveRecoveryAttempt(
          payment,
          diagnosis,
          policy,
          true,
          payment.amount,
          "RECOVERED",
          audit
        );

      console.log(
        "Recovery saved to Supabase:",
        saved.id
      );

      return NextResponse.json({
        success: true,
        recovered: true,
        amountRecovered:
          payment.amount,
        status: "RECOVERED",
        probability:
          diagnosis.probability,
        strategy:
          diagnosis.strategy,
        reason:
          "High-confidence recovery action succeeded in the sandbox.",
        audit,
        database: {
          saved: true,
          recordId: saved.id,
        },
      });
    }

    // 5. Customer action required
    audit.push({
      step: "RECOVERY_ATTEMPTED",
      timestamp:
        new Date().toISOString(),
      message:
        "Recommended recovery action completed. Revenue remains unresolved.",
    });

    const saved =
      await saveRecoveryAttempt(
        payment,
        diagnosis,
        policy,
        false,
        0,
        "AT_RISK",
        audit
      );

    console.log(
      "Recovery saved to Supabase:",
      saved.id
    );

    return NextResponse.json({
      success: true,
      recovered: false,
      amountRecovered: 0,
      status: "AT_RISK",
      probability:
        diagnosis.probability,
      strategy:
        diagnosis.strategy,
      reason:
        "Recovery recommendation generated successfully. Customer action is required.",
      audit,
      database: {
        saved: true,
        recordId: saved.id,
      },
    });
  } catch (error) {
    console.error(
      "Recovery API error:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Recovery agent failed.",
      },
      { status: 500 }
    );
  }
}