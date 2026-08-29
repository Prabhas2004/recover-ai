import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type AuditStep = {
  step: string;
  timestamp: string;
  message: string;
};

function createSupabase() {
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
   WORKER AUTHENTICATION
   ========================================================= */

function isWorkerAuthorized(request: Request): boolean {
  const workerSecret =
    process.env.RECOVERY_WORKER_SECRET;

  if (!workerSecret) {
    throw new Error(
      "RECOVERY_WORKER_SECRET is not configured."
    );
  }

  const authorization =
    request.headers.get("authorization");

  if (
    !authorization ||
    !authorization.startsWith("Bearer ")
  ) {
    return false;
  }

  const providedSecret =
    authorization
      .substring("Bearer ".length)
      .trim();

  return providedSecret === workerSecret;
}

/* =========================================================
   POST /api/recovery/retry-worker
   ========================================================= */

export async function POST(
  request: Request
) {
  try {
    /* =====================================================
       1. WORKER AUTHENTICATION
       ===================================================== */

    if (!isWorkerAuthorized(request)) {
      return NextResponse.json(
        {
          success: false,
          error: "Unauthorized.",
        },
        {
          status: 401,
        }
      );
    }

    const supabase = createSupabase();

    console.log(
      "================================="
    );

    console.log(
      "RECOVERAI RETRY WORKER"
    );

    console.log(
      "================================="
    );

    const now =
      new Date().toISOString();

    /*
     * A retry becomes eligible 30 minutes after
     * the recovery attempt was recorded.
     */

    const thirtyMinutesAgo =
      new Date(
        Date.now() -
          30 * 60 * 1000
      ).toISOString();

    /* =====================================================
       2. FIND ELIGIBLE RETRIES
       ===================================================== */

    const {
      data: candidates,
      error,
    } = await supabase
      .from("recovery_attempts")
      .select("*")
      .eq(
        "strategy",
        "Retry after 30 minutes"
      )
      .eq(
        "status",
        "AT_RISK"
      )
      .eq(
        "recovered",
        false
      )
      .eq(
        "policy_allowed",
        true
      )
      .gte(
        "probability",
        80
      )
      .lte(
        "created_at",
        thirtyMinutesAgo
      )
      .order(
        "created_at",
        {
          ascending: true,
        }
      );

    if (error) {
      console.error(
        "Retry worker database error:",
        error
      );

      return NextResponse.json(
        {
          success: false,
          error:
            "Unable to find scheduled retry payments.",
        },
        {
          status: 500,
        }
      );
    }

    /* =====================================================
       3. NO CANDIDATES
       ===================================================== */

    if (
      !candidates ||
      candidates.length === 0
    ) {
      console.log(
        "No retry payments are currently due."
      );

      return NextResponse.json({
        success: true,
        processed: 0,
        message:
          "No scheduled retries are currently due.",
        checkedAt: now,
      });
    }

    /* =====================================================
       4. PROCESS CANDIDATES
       ===================================================== */

    const results: Array<{
      paymentId: string;
      success: boolean;
      status?:
        | "RECOVERED"
        | "ESCALATED";
      amountRecovered?: number;
      message?: string;
      error?: string;
    }> = [];

    for (
      const payment of candidates
    ) {
      console.log(
        "Processing retry:",
        payment.payment_id
      );

      const audit: AuditStep[] =
        Array.isArray(
          payment.audit
        )
          ? [...payment.audit]
          : [];

      audit.push({
        step:
          "RETRY_WORKER_STARTED",
        timestamp:
          new Date().toISOString(),
        message:
          "Scheduled retry reached its execution window.",
      });

      /* ===================================================
         5. SANDBOX RETRY
         ===================================================

         IMPORTANT:
         No real customer is charged here.

         This is a sandbox simulation.
      */

      const retrySucceeded =
        payment.probability >= 80 &&
        payment.strategy ===
          "Retry after 30 minutes";

      /* ===================================================
         6. SUCCESSFUL SANDBOX RECOVERY
         =================================================== */

      if (retrySucceeded) {
        audit.push({
          step:
            "RETRY_EXECUTED",
          timestamp:
            new Date().toISOString(),
          message:
            "Payment retry executed successfully in sandbox.",
        });

        audit.push({
          step:
            "REVENUE_RECOVERED",
          timestamp:
            new Date().toISOString(),
          message:
            `${payment.amount} marked as recovered revenue.`,
        });

        const {
          error: updateError,
        } = await supabase
          .from(
            "recovery_attempts"
          )
          .update({
            status:
              "RECOVERED",

            recovered:
              true,

            amount_recovered:
              payment.amount,

            reason:
              "Scheduled high-confidence retry succeeded in sandbox.",

            audit,
          })
          .eq(
            "id",
            payment.id
          );

        if (updateError) {
          console.error(
            "Failed to update recovered payment:",
            updateError
          );

          results.push({
            paymentId:
              payment.payment_id,

            success: false,

            error:
              "Failed to record recovery result.",
          });

          continue;
        }

        results.push({
          paymentId:
            payment.payment_id,

          success: true,

          status:
            "RECOVERED",

          amountRecovered:
            payment.amount,

          message:
            "Payment successfully recovered in sandbox.",
        });

        continue;
      }

      /* ===================================================
         7. RETRY FAILED
         =================================================== */

      audit.push({
        step:
          "RETRY_FAILED",

        timestamp:
          new Date().toISOString(),

        message:
          "Scheduled retry did not meet recovery conditions.",
      });

      audit.push({
        step:
          "ESCALATED",

        timestamp:
          new Date().toISOString(),

        message:
          "Payment escalated for customer or manual action.",
      });

      const {
        error: updateError,
      } = await supabase
        .from(
          "recovery_attempts"
        )
        .update({
          status:
            "ESCALATED",

          recovered:
            false,

          amount_recovered:
            0,

          reason:
            "Scheduled retry failed. Payment requires further action.",

          audit,
        })
        .eq(
          "id",
          payment.id
        );

      if (updateError) {
        console.error(
          "Failed to update escalated payment:",
          updateError
        );

        results.push({
          paymentId:
            payment.payment_id,

          success: false,

          error:
            "Failed to record escalation result.",
        });

        continue;
      }

      results.push({
        paymentId:
          payment.payment_id,

        success: true,

        status:
          "ESCALATED",

        amountRecovered:
          0,

        message:
          "Payment retry failed and was escalated.",
      });
    }

    /* =====================================================
       8. SUMMARY
       ===================================================== */

    const recoveredCount =
      results.filter(
        (result) =>
          result.status ===
          "RECOVERED"
      ).length;

    const escalatedCount =
      results.filter(
        (result) =>
          result.status ===
          "ESCALATED"
      ).length;

    console.log(
      "================================="
    );

    console.log(
      "RETRY WORKER COMPLETE"
    );

    console.log({
      processed:
        results.length,

      recoveredCount,

      escalatedCount,
    });

    console.log(
      "================================="
    );

    return NextResponse.json({
      success: true,

      processed:
        results.length,

      recoveredCount,

      escalatedCount,

      checkedAt: now,

      results,
    });
  } catch (error) {
    console.error(
      "Retry worker error:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Retry worker failed.",
      },
      {
        status: 500,
      }
    );
  }
}