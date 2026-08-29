import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

export async function POST(req: NextRequest) {
  try {
    // Read the raw body first.
    // Razorpay signature verification requires the exact raw body.
    const body = await req.text();

    const signature = req.headers.get("x-razorpay-signature");

    if (!signature) {
      return NextResponse.json(
        {
          success: false,
          error: "Missing Razorpay webhook signature",
        },
        { status: 400 }
      );
    }

    const webhookSecret =
      process.env.RAZORPAY_WEBHOOK_SECRET;

    if (!webhookSecret) {
      console.error(
        "RAZORPAY_WEBHOOK_SECRET is not configured"
      );

      return NextResponse.json(
        {
          success: false,
          error: "Webhook secret is not configured",
        },
        { status: 500 }
      );
    }

    // Verify Razorpay webhook signature
    const expectedSignature = crypto
      .createHmac("sha256", webhookSecret)
      .update(body)
      .digest("hex");

    if (
      signature.length !== expectedSignature.length ||
      !crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature)
      )
    ) {
      console.error(
        "Invalid Razorpay webhook signature"
      );

      return NextResponse.json(
        {
          success: false,
          error: "Invalid webhook signature",
        },
        { status: 401 }
      );
    }

    const event = JSON.parse(body);

    console.log("=================================");
    console.log("RAZORPAY WEBHOOK RECEIVED");
    console.log("Event:", event.event);
    console.log("=================================");

    // =====================================================
    // PAYMENT CAPTURED
    // =====================================================

    if (event.event === "payment.captured") {
      const payment =
        event.payload?.payment?.entity;

      console.log("Payment captured:", {
        id: payment?.id,
        amount: payment?.amount,
        currency: payment?.currency,
        status: payment?.status,
        email: payment?.email,
        contact: payment?.contact,
      });

      return NextResponse.json({
        success: true,
        received: true,
        event: event.event,
        action: "payment_captured",
      });
    }

    // =====================================================
    // PAYMENT FAILED
    // =====================================================

    if (event.event === "payment.failed") {
      const payment =
        event.payload?.payment?.entity;

      if (!payment?.id) {
        return NextResponse.json(
          {
            success: false,
            error: "Payment information missing",
          },
          { status: 400 }
        );
      }

      console.log("Payment failed:", {
        id: payment.id,
        amount: payment.amount,
        currency: payment.currency,
        errorCode: payment.error_code,
        errorDescription:
          payment.error_description,
        errorReason: payment.error_reason,
      });

      // Razorpay gives amount in paise.
      // RecoverAI works with rupees.
      const recoveryPayment = {
        id: payment.id,

        customer:
          payment.email ||
          payment.contact ||
          "Unknown Customer",

        amount:
          Number(payment.amount || 0) / 100,

        failure:
          payment.error_description ||
          payment.error_reason ||
          "Unknown payment failure",

        attempts: 0,

        probability: 0,

        strategy: "Automatic diagnosis",

        status: "AT_RISK" as const,

        reason:
          "Payment failed in Razorpay and was sent to RecoverAI for analysis.",
      };

      console.log(
        "Sending payment to RecoverAI..."
      );

      // IMPORTANT:
      // Use localhost instead of req.url.
      // req.url points to the Cloudflare HTTPS URL.
      const recoveryResponse = await fetch(
        "http://localhost:3000/api/recovery",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          body: JSON.stringify(
            recoveryPayment
          ),
        }
      );

      if (!recoveryResponse.ok) {
        const errorText =
          await recoveryResponse.text();

        console.error(
          "RecoverAI API returned an error:",
          recoveryResponse.status,
          errorText
        );

        return NextResponse.json(
          {
            success: false,
            received: true,
            event: event.event,
            error:
              "RecoverAI recovery API failed",
          },
          { status: 500 }
        );
      }

      const recoveryResult =
        await recoveryResponse.json();

      console.log(
        "================================="
      );
      console.log(
        "RECOVERAI ANALYSIS RESULT"
      );
      console.log(
        "================================="
      );

      console.log(
        JSON.stringify(
          recoveryResult,
          null,
          2
        )
      );

      return NextResponse.json({
        success: true,
        received: true,
        event: event.event,
        recovery: recoveryResult,
      });
    }

    // =====================================================
    // OTHER EVENTS
    // =====================================================

    console.log(
      "Event ignored:",
      event.event
    );

    return NextResponse.json({
      success: true,
      received: true,
      event: event.event,
      action: "ignored",
    });
  } catch (error) {
    console.error(
      "Razorpay webhook error:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          "Webhook processing failed",
      },
      { status: 500 }
    );
  }
}