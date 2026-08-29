import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { Resend } from "resend";

type RecoveryEmailRequest = {
  customerName: string;
  customerEmail: string;
  amount: number;
  paymentId: string;
  strategy: string;
};

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

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
            // Cookie setting can be ignored in some
            // server-rendering situations.
          }
        },
      },
    }
  );
}

export async function POST(request: Request) {
  try {
    // --------------------------------------------------
    // 1. CHECK AUTHENTICATION
    // --------------------------------------------------

    const supabase =
      await createSupabaseServerClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        {
          success: false,
          error: "Unauthorized",
        },
        { status: 401 }
      );
    }

    // --------------------------------------------------
    // 2. CHECK RESEND API KEY
    // --------------------------------------------------

    const apiKey =
      process.env.RESEND_API_KEY;

    if (!apiKey) {
      console.error(
        "RESEND_API_KEY is missing."
      );

      return NextResponse.json(
        {
          success: false,
          error:
            "Email service is not configured.",
        },
        { status: 500 }
      );
    }

    const resend = new Resend(apiKey);

    // --------------------------------------------------
    // 3. READ REQUEST
    // --------------------------------------------------

    const body =
      (await request.json()) as RecoveryEmailRequest;

    // --------------------------------------------------
    // 4. VALIDATE REQUEST
    // --------------------------------------------------

    if (
      !body.customerName ||
      !body.customerEmail ||
      typeof body.amount !== "number" ||
      !Number.isFinite(body.amount) ||
      !body.paymentId ||
      !body.strategy
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Invalid recovery email payload.",
        },
        { status: 400 }
      );
    }

    // Basic email validation
    const emailPattern =
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (
      !emailPattern.test(
        body.customerEmail.trim()
      )
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Invalid customer email address.",
        },
        { status: 400 }
      );
    }

    // --------------------------------------------------
    // 5. LOG SAFE INFORMATION
    // --------------------------------------------------

    console.log(
      "RECOVERY EMAIL REQUEST:",
      {
        userId: user.id,
        customerName: body.customerName,
        customerEmail: body.customerEmail,
        amount: body.amount,
        paymentId: body.paymentId,
        strategy: body.strategy,
      }
    );

    // --------------------------------------------------
    // 6. SEND EMAIL
    // --------------------------------------------------

    const result =
      await resend.emails.send({
        from:
          "RecoverAI <onboarding@resend.dev>",

        to: [
          body.customerEmail.trim(),
        ],

        subject:
          "Action needed: Your payment could not be completed",

        html: `
          <div style="
            font-family: Arial, sans-serif;
            background: #f8fafc;
            padding: 40px 20px;
          ">

            <div style="
              max-width: 600px;
              margin: 0 auto;
              background: white;
              border-radius: 16px;
              padding: 36px;
              box-shadow: 0 4px 20px rgba(0,0,0,0.08);
            ">

              <div style="
                text-align: center;
                margin-bottom: 30px;
              ">

                <h1 style="
                  margin: 0;
                  font-size: 28px;
                  color: #111827;
                ">
                  RecoverAI
                </h1>

                <p style="
                  margin-top: 8px;
                  color: #6b7280;
                  font-size: 14px;
                ">
                  Payment Recovery Assistant
                </p>

              </div>

              <h2 style="
                color: #111827;
                font-size: 22px;
              ">
                Payment assistance
              </h2>

              <p style="
                color: #374151;
                font-size: 16px;
                line-height: 1.7;
              ">
                Hi ${escapeHtml(
                  body.customerName
                )},
              </p>

              <p style="
                color: #374151;
                font-size: 16px;
                line-height: 1.7;
              ">
                We noticed that your recent payment could not
                be completed.
              </p>

              <div style="
                background: #f3f4f6;
                border-radius: 12px;
                padding: 20px;
                margin: 24px 0;
              ">

                <p style="
                  margin: 0 0 12px;
                  color: #374151;
                ">
                  <strong>Payment amount:</strong>
                  ₹${body.amount.toLocaleString(
                    "en-IN"
                  )}
                </p>

                <p style="
                  margin: 0 0 12px;
                  color: #374151;
                  word-break: break-all;
                ">
                  <strong>Payment ID:</strong>
                  ${escapeHtml(
                    body.paymentId
                  )}
                </p>

                <p style="
                  margin: 0;
                  color: #374151;
                ">
                  <strong>Recommended action:</strong>
                  ${escapeHtml(
                    body.strategy
                  )}
                </p>

              </div>

              <p style="
                color: #374151;
                font-size: 16px;
                line-height: 1.7;
              ">
                Please try your payment again using the
                available payment options.
              </p>

              <p style="
                color: #374151;
                font-size: 16px;
                line-height: 1.7;
              ">
                If the problem continues, please contact your
                bank or payment provider.
              </p>

              <div style="
                margin-top: 32px;
                padding-top: 20px;
                border-top: 1px solid #e5e7eb;
              ">

                <p style="
                  margin: 0;
                  color: #9ca3af;
                  font-size: 13px;
                  line-height: 1.6;
                ">
                  This message was sent by RecoverAI to help
                  resolve an unsuccessful payment.
                </p>

              </div>

            </div>

          </div>
        `,
      });

    // --------------------------------------------------
    // 7. CHECK RESEND RESULT
    // --------------------------------------------------

    if (result.error) {
      console.error(
        "RESEND EMAIL ERROR:",
        result.error
      );

      return NextResponse.json(
        {
          success: false,
          error:
            "Unable to send recovery email.",
        },
        { status: 500 }
      );
    }

    // --------------------------------------------------
    // 8. SUCCESS
    // --------------------------------------------------

    console.log(
      "RECOVERY EMAIL SENT:",
      {
        userId: user.id,
        emailId: result.data?.id,
        customerEmail:
          body.customerEmail,
        paymentId:
          body.paymentId,
      }
    );

    return NextResponse.json({
      success: true,
      message:
        "Recovery email sent successfully.",
      emailId: result.data?.id,
      customerEmail:
        body.customerEmail,
      paymentId:
        body.paymentId,
    });

  } catch (error) {
    console.error(
      "RECOVERY EMAIL API ERROR:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          "Unable to send recovery email.",
      },
      { status: 500 }
    );
  }
}