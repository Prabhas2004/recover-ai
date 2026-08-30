import { NextResponse } from "next/server";
import Razorpay from "razorpay";

export async function GET() {
  try {
    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;

    console.log("Razorpay Key ID exists:", Boolean(keyId));
    console.log("Razorpay Secret exists:", Boolean(keySecret));

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

    const payments = await razorpay.payments.all({
      count: 100,
    });

    console.log("Razorpay payments fetched:", payments.count);

    return NextResponse.json({
      success: true,
      count: payments.count,
      payments: payments.items || [],
    });
  } catch (error: any) {
    console.error("RAZORPAY PAYMENTS ERROR:", error);

    return NextResponse.json(
      {
        success: false,
        error: error?.error?.description || error?.message || "Razorpay API error",
        code: error?.error?.code,
        statusCode: error?.statusCode,
      },
      { status: 500 }
    );
  }
}