import { NextResponse } from "next/server";
import Razorpay from "razorpay";

export async function GET() {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  console.log("=== RAZORPAY DEBUG ===");
  console.log("KEY ID exists:", !!keyId);
  console.log("KEY ID prefix:", keyId?.substring(0, 8));
  console.log("KEY ID length:", keyId?.length);
  console.log("SECRET exists:", !!keySecret);
  console.log("SECRET length:", keySecret?.length);
  console.log("======================");

  if (!keyId || !keySecret) {
    return NextResponse.json({
      success: false,
      error: "Environment variables missing",
      keyIdExists: !!keyId,
      secretExists: !!keySecret,
    });
  }

  try {
    const razorpay = new Razorpay({
      key_id: keyId,
      key_secret: keySecret,
    });

    const payments = await razorpay.payments.all({
      count: 1,
    });

    return NextResponse.json({
      success: true,
      count: payments.count,
      payments: payments.items || [],
    });
  } catch (error: any) {
    console.error("=== RAZORPAY ERROR ===");
    console.error(error);
    console.error("======================");

    return NextResponse.json(
      {
        success: false,
        error: error?.error?.description || error?.message,
        code: error?.error?.code,
        statusCode: error?.statusCode,
      },
      { status: 500 }
    );
  }
}