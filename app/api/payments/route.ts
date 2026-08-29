import { NextResponse } from "next/server";
import Razorpay from "razorpay";

export async function GET() {
  try {
    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;

    if (!keyId || !keySecret) {
      return NextResponse.json(
        {
          success: false,
          error: "Razorpay credentials are not configured.",
        },
        { status: 500 }
      );
    }

    const razorpay = new Razorpay({
      key_id: keyId,
      key_secret: keySecret,
    });

    // Fetch actual Razorpay payments
    const payments = await razorpay.payments.all({
      count: 100,
    });

    // Fetch Razorpay Payment Links
    const paymentLinks = await razorpay.paymentLink.all({
      count: 100,
    });

    return NextResponse.json({
      success: true,

      count: payments.count,

      payments: payments.items || [],

      paymentLinks: paymentLinks.payment_links || [],

    });
  } catch (error) {
    console.error("Razorpay API error:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          "Unable to fetch Razorpay payments and payment links.",
      },
      { status: 500 }
    );
  }
}