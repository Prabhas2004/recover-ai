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

export async function GET() {
  try {
    const supabase = createSupabase();

    const { data: payments, error } =
      await supabase
        .from("recovery_attempts")
        .select(
          `
          id,
          payment_id,
          customer,
          customer_name,
          amount,
          failure,
          failure_reason,
          attempts,
          probability,
          strategy,
          status,
          recovered,
          amount_recovered,
          reason,
          policy_allowed,
          policy_message,
          audit,
          created_at
        `
        )
        .order("created_at", {
          ascending: false,
        });

    if (error) {
      console.error(
        "Analytics database error:",
        error
      );

      return NextResponse.json(
        {
          success: false,
          error:
            "Unable to load analytics.",
          databaseError: error.message,
        },
        { status: 500 }
      );
    }

    const records = payments ?? [];

    const totalAttempts =
      records.length;

    const revenueAtRisk =
      records.reduce(
        (sum, payment) =>
          sum + Number(payment.amount || 0),
        0
      );

    const revenueRecovered =
      records.reduce(
        (sum, payment) =>
          sum +
          Number(
            payment.amount_recovered || 0
          ),
        0
      );

    const revenueStillAtRisk =
      Math.max(
        revenueAtRisk -
          revenueRecovered,
        0
      );

    const recoveredCount =
      records.filter(
        (payment) =>
          payment.recovered === true
      ).length;

    const atRiskCount =
      records.filter(
        (payment) =>
          payment.status === "AT_RISK"
      ).length;

    const escalatedCount =
      records.filter(
        (payment) =>
          payment.status === "ESCALATED"
      ).length;

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

    const averageProbability =
      totalAttempts > 0
        ? Number(
            (
              records.reduce(
                (sum, payment) =>
                  sum +
                  Number(
                    payment.probability ||
                      0
                  ),
                0
              ) /
              totalAttempts
            ).toFixed(1)
          )
        : 0;

    const highConfidenceCount =
      records.filter(
        (payment) =>
          Number(
            payment.probability || 0
          ) >= 80
      ).length;

    const successfulHighConfidence =
      records.filter(
        (payment) =>
          Number(
            payment.probability || 0
          ) >= 80 &&
          payment.recovered === true
      ).length;

    const aiSuccessRate =
      highConfidenceCount > 0
        ? Number(
            (
              (successfulHighConfidence /
                highConfidenceCount) *
              100
            ).toFixed(1)
          )
        : 0;

    const strategyStats: Record<
      string,
      {
        count: number;
        recovered: number;
        revenueRecovered: number;
      }
    > = {};

    for (const payment of records) {
      const strategy =
        payment.strategy ||
        "Unknown";

      if (!strategyStats[strategy]) {
        strategyStats[strategy] = {
          count: 0,
          recovered: 0,
          revenueRecovered: 0,
        };
      }

      strategyStats[strategy].count +=
        1;

      if (payment.recovered) {
        strategyStats[
          strategy
        ].recovered += 1;

        strategyStats[
          strategy
        ].revenueRecovered += Number(
          payment.amount_recovered || 0
        );
      }
    }

    const strategies = Object.entries(
      strategyStats
    ).map(
      ([strategy, stats]) => ({
        strategy,
        count: stats.count,
        recovered: stats.recovered,
        revenueRecovered:
          stats.revenueRecovered,
        successRate:
          stats.count > 0
            ? Number(
                (
                  (stats.recovered /
                    stats.count) *
                  100
                ).toFixed(1)
              )
            : 0,
      })
    );

    return NextResponse.json({
      success: true,

      summary: {
        totalAttempts,
        revenueAtRisk,
        revenueRecovered,
        revenueStillAtRisk,
        recoveryRate,
        recoveredCount,
        atRiskCount,
        escalatedCount,
        averageProbability,
        highConfidenceCount,
        successfulHighConfidence,
        aiSuccessRate,
      },

      strategies,

      payments: records,
    });
  } catch (error) {
    console.error(
      "Analytics API error:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Analytics API failed.",
      },
      { status: 500 }
    );
  }
}