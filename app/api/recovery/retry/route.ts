import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type Payment = {
  id: string;
  customer: string;
  amount: number;
  failure: string;
  attempts: number;
  status?: "AT_RISK" | "RECOVERED" | "ESCALATED";
};

type Diagnosis = {
  probability: number;
  strategy: string;
  reason: string;
};

function analyze(payment: Payment): Diagnosis {
  const failure = payment.failure.toLowerCase();

  // Safety rule: never retry after the maximum attempts.
  if (payment.attempts >= 2) {
    return {
      probability: 18,
      strategy: "Stop & escalate",
      reason:
        "Maximum automated attempts reached. Further retries are blocked by policy.",
    };
  }

  // Temporary failures are candidates for delayed retry.
  if (
    failure.includes("temporary") ||
    failure.includes("temporarily") ||
    failure.includes("try again later") ||
    failure.includes("network") ||
    failure.includes("timeout")
  ) {
    return {
      probability: 87,
      strategy: "Retry after 30 minutes",
      reason:
        "The failure appears temporary. A delayed retry provides a strong recovery opportunity while avoiding an immediate repeated charge.",
    };
  }

  // Insufficient funds.
  if (
    failure.includes("insufficient") ||
    failure.includes("insufficient funds")
  ) {
    return {
      probability: 68,
      strategy: "Send payment reminder",
      reason:
        "Insufficient funds should not trigger an automatic retry. RecoverAI recommends customer action first.",
    };
  }

  // Bank decline.
  if (
    failure.includes("declined by the bank") ||
    failure.includes("bank declined") ||
    failure.includes("declined")
  ) {
    return {
      probability: 55,
      strategy: "Send payment reminder",
      reason:
        "The bank declined the payment. RecoverAI avoids an immediate repeated charge and recommends customer action.",
    };
  }

  // Authentication failure.
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
        "Customer authentication appears to be required before another payment attempt.",
    };
  }

  return {
    probability: 42,
    strategy: "Manual verification",
    reason:
      "The payment state is uncertain. RecoverAI requires verification before an automated retry.",
  };
}

/* =========================================================
   SERVER-SIDE SUPABASE CLIENT
   ========================================================= */

function createAdminSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;

  if (!url || !key) {
    throw new Error(
      "Supabase server configuration is missing."
    );
  }

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

/* =========================================================
   AUTHENTICATION
   ========================================================= */

async function getAuthenticatedUser(request: Request) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey) {
    throw new Error(
      "Supabase authentication configuration is missing."
    );
  }

  /*
   * Read the Supabase access token from the
   * Authorization header.
   *
   * Expected:
   *
   * Authorization: Bearer <access_token>
   */
  const authorization =
    request.headers.get("authorization");

  if (
    !authorization ||
    !authorization.startsWith("Bearer ")
  ) {
    return null;
  }

  const token =
    authorization.substring("Bearer ".length).trim();

  if (!token) {
    return null;
  }

  const supabase = createClient(
    supabaseUrl,
    anonKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);

  if (error || !user) {
    return null;
  }

  return user;
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
    p.id.length <= 200 &&
    typeof p.customer === "string" &&
    p.customer.length > 0 &&
    p.customer.length <= 200 &&
    typeof p.amount === "number" &&
    Number.isFinite(p.amount) &&
    p.amount >= 0 &&
    typeof p.failure === "string" &&
    p.failure.length > 0 &&
    p.failure.length <= 500 &&
    typeof p.attempts === "number" &&
    Number.isFinite(p.attempts) &&
    Number.isInteger(p.attempts) &&
    p.attempts >= 0
  );
}

/* =========================================================
   POST /api/recovery/retry
   ========================================================= */

export async function POST(
  request: Request
) {
  try {
    /* =====================================================
       1. AUTHENTICATION
       ===================================================== */

    const user =
      await getAuthenticatedUser(request);

    if (!user) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Authentication required.",
        },
        {
          status: 401,
        }
      );
    }

    console.log(
      "Authenticated recovery retry request:",
      user.id
    );

    /* =====================================================
       2. READ REQUEST
       ===================================================== */

    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        {
          success: false,
          error:
            "Invalid JSON request.",
        },
        {
          status: 400,
        }
      );
    }

    /*
     * The frontend sends the payment object directly.
     * We validate it before doing anything.
     */

    if (!isValidPayment(body)) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Invalid payment payload.",
        },
        {
          status: 400,
        }
      );
    }

    const payment = body;

    /* =====================================================
       3. LOG REQUEST
       ===================================================== */

    console.log(
      "================================="
    );

    console.log(
      "RECOVERAI SMART RETRY"
    );

    console.log(
      "================================="
    );

    console.log({
      userId: user.id,
      paymentId: payment.id,
      amount: payment.amount,
      failure: payment.failure,
      attempts: payment.attempts,
    });

    /* =====================================================
       4. AI DIAGNOSIS
       ===================================================== */

    const diagnosis =
      analyze(payment);

    console.log(
      "Retry diagnosis:",
      diagnosis
    );

    /* =====================================================
       5. RETRY POLICY
       ===================================================== */

    const retryAllowed =
      diagnosis.strategy ===
        "Retry after 30 minutes" &&
      diagnosis.probability >= 80 &&
      payment.attempts < 2 &&
      payment.status !== "RECOVERED";

    /*
     * Never automatically retry a payment that does
     * not satisfy the safety policy.
     */

    if (!retryAllowed) {
      console.log(
        "Smart retry blocked by Recovery Policy Engine."
      );

      return NextResponse.json({
        success: true,
        retryScheduled: false,
        status: "ESCALATED",
        probability:
          diagnosis.probability,
        strategy:
          diagnosis.strategy,
        reason:
          "Automatic retry was not approved by the Recovery Policy Engine.",
        audit: [
          {
            step: "PAYMENT_DETECTED",
            timestamp:
              new Date().toISOString(),
            message:
              `Payment ${payment.id} detected as a recovery candidate.`,
          },
          {
            step: "AI_DIAGNOSIS",
            timestamp:
              new Date().toISOString(),
            message:
              `${diagnosis.strategy} selected with ${diagnosis.probability}% recovery probability.`,
          },
          {
            step: "RETRY_POLICY",
            timestamp:
              new Date().toISOString(),
            message:
              "Automatic retry blocked because the payment does not meet the high-confidence retry criteria.",
          },
        ],
      });
    }

    /* =====================================================
       6. CALCULATE RETRY TIME
       ===================================================== */

    const retryAt = new Date(
      Date.now() +
        30 * 60 * 1000
    );

    /* =====================================================
       7. AUDIT
       ===================================================== */

    const now =
      () => new Date().toISOString();

    const audit = [
      {
        step: "PAYMENT_DETECTED",
        timestamp: now(),
        message:
          `Payment ${payment.id} detected as a recovery candidate.`,
      },
      {
        step: "AI_DIAGNOSIS",
        timestamp: now(),
        message:
          `${diagnosis.strategy} selected with ${diagnosis.probability}% recovery probability.`,
      },
      {
        step: "RETRY_POLICY",
        timestamp: now(),
        message:
          "High-confidence retry approved by Recovery Policy Engine.",
      },
      {
        step: "RETRY_SCHEDULED",
        timestamp: now(),
        message:
          `Payment retry scheduled for ${retryAt.toISOString()}.`,
      },
    ];

    /* =====================================================
       8. DATABASE
       ===================================================== */

    const supabase =
      createAdminSupabase();

    const {
      data,
      error,
    } = await supabase
      .from("recovery_attempts")
      .insert({
        payment_id:
          payment.id,

        customer_name:
          payment.customer,

        amount:
          payment.amount,

        failure_reason:
          payment.failure,

        attempts:
          payment.attempts,

        probability:
          diagnosis.probability,

        strategy:
          diagnosis.strategy,

        status:
          "AT_RISK",

        recovered:
          false,

        amount_recovered:
          0,

        reason:
          "High-confidence temporary failure. Retry scheduled.",

        policy_allowed:
          true,

        policy_message:
          "High-confidence retry approved by Recovery Policy Engine.",
      })
      .select("id")
      .single();

    if (error) {
      console.error(
        "Retry database error:",
        error
      );

      return NextResponse.json(
        {
          success: false,
          error:
            "Retry was approved but could not be recorded.",
        },
        {
          status: 500,
        }
      );
    }

    /* =====================================================
       9. SUCCESS RESPONSE
       ===================================================== */

    console.log(
      "================================="
    );

    console.log(
      "SMART RETRY SCHEDULED"
    );

    console.log(
      "================================="
    );

    console.log({
      userId: user.id,
      paymentId:
        payment.id,
      retryAt:
        retryAt.toISOString(),
      probability:
        diagnosis.probability,
      databaseId:
        data?.id,
    });

    return NextResponse.json({
      success: true,

      retryScheduled:
        true,

      status:
        "AT_RISK",

      paymentId:
        payment.id,

      amount:
        payment.amount,

      probability:
        diagnosis.probability,

      strategy:
        diagnosis.strategy,

      retryAt:
        retryAt.toISOString(),

      database: {
        saved: true,
        recordId:
          data?.id,
      },

      reason:
        "High-confidence temporary failure. Payment retry scheduled safely for 30 minutes later.",

      audit,
    });
  } catch (error) {
    console.error(
      "Smart retry API error:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unable to schedule payment retry.",
      },
      {
        status: 500,
      }
    );
  }
}