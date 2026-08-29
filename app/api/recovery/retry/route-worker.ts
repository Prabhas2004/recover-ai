import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function createSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;

  if (!url || !key) {
    throw new Error(
      "SUPABASE_URL or SUPABASE_SECRET_KEY is not configured."
    );
  }

  return createClient(url, key);
}

export async function POST() {
  try {
    const supabase = createSupabase();

    console.log("=================================");
    console.log("RECOVERAI RETRY WORKER");
    console.log("=================================");

    const now = new Date().toISOString();

    // Find payments that were scheduled for retry.
    //
    // The current schema does not have a dedicated retry_at
    // column, so we identify high-confidence retry records
    // and use their created_at timestamp.
    //
    // For the demo, a record becomes eligible after 30 minutes.

    const thirtyMinutesAgo = new Date(
      Date.now() - 30 * 60 * 1000
    ).toISOString();

    const { data: candidates, error } = await supabase
      .from("recovery_attempts")
      .select("*")
      .eq("strategy", "Retry after 30 minutes")
      .eq("status", "AT_RISK")
      .eq("recovered", false)
      .eq("policy_allowed", true)
      .gte("probability", 80)
      .lte("created_at", thirtyMinutesAgo)
      .order("created_at", {
        ascending: true,
      });

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
          databaseError: error.message,
        },
        { status: 500 }
      );
    }

    if (!candidates || candidates.length === 0) {
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

    const results = [];

    for (const payment of candidates) {
      console.log(
        "Processing retry:",
        payment.payment_id
      );

      const audit = Array.isArray(payment.audit)
        ? [...payment.audit]
        : [];

      audit.push({
        step: "RETRY_WORKER_STARTED",
        timestamp: new Date().toISOString(),
        message:
          "Scheduled retry reached its execution window.",
      });

      /*
       * SANDBOX RETRY
       *
       * We do not charge a real customer here.
       *
       * A high-confidence temporary failure is
       * simulated as successfully recovered.
       */

      const retrySucceeded =
        payment.probability >= 80 &&
        payment.strategy ===
          "Retry after 30 minutes";

      if (retrySucceeded) {
        audit.push({
          step: "RETRY_EXECUTED",
          timestamp:
            new Date().toISOString(),
          message:
            "Payment retry executed successfully in sandbox.",
        });

        audit.push({
          step: "REVENUE_RECOVERED",
          timestamp:
            new Date().toISOString(),
          message:
            `${payment.amount} marked as recovered revenue.`,
        });

        const { error: updateError } =
          await supabase
            .from("recovery_attempts")
            .update({
              status: "RECOVERED",
              recovered: true,
              amount_recovered:
                payment.amount,
              reason:
                "Scheduled high-confidence retry succeeded in sandbox.",
              audit,
            })
            .eq("id", payment.id);

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
              updateError.message,
          });

          continue;
        }

        results.push({
          paymentId:
            payment.payment_id,
          success: true,
          status: "RECOVERED",
          amountRecovered:
            payment.amount,
          message:
            "Payment successfully recovered in sandbox.",
        });

        continue;
      }

      // ------------------------------------------------
      // RETRY FAILED / ESCALATED
      // ------------------------------------------------

      audit.push({
        step: "RETRY_FAILED",
        timestamp:
          new Date().toISOString(),
        message:
          "Scheduled retry did not meet recovery conditions.",
      });

      audit.push({
        step: "ESCALATED",
        timestamp:
          new Date().toISOString(),
        message:
          "Payment escalated for customer or manual action.",
      });

      const { error: updateError } =
        await supabase
          .from("recovery_attempts")
          .update({
            status: "ESCALATED",
            reason:
              "Scheduled retry failed. Payment requires further action.",
            audit,
          })
          .eq("id", payment.id);

      if (updateError) {
        results.push({
          paymentId:
            payment.payment_id,
          success: false,
          error:
            updateError.message,
        });

        continue;
      }

      results.push({
        paymentId:
          payment.payment_id,
        success: true,
        status: "ESCALATED",
        amountRecovered: 0,
        message:
          "Payment retry failed and was escalated.",
      });
    }

    const recoveredCount =
      results.filter(
        (result) =>
          result.status === "RECOVERED"
      ).length;

    const escalatedCount =
      results.filter(
        (result) =>
          result.status === "ESCALATED"
      ).length;

    console.log(
      "================================="
    );

    console.log(
      "RETRY WORKER COMPLETE"
    );

    console.log({
      processed: results.length,
      recoveredCount,
      escalatedCount,
    });

    console.log(
      "================================="
    );

    return NextResponse.json({
      success: true,
      processed: results.length,
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
      { status: 500 }
    );
  }
}