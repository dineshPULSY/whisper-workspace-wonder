import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@10.17.0?target=deno";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts"; // Import getCorsHeaders

// IMPORTANT: Set these environment variables in your Supabase Function settings
const supabaseUrl = Deno.env.get("SUPABASE_URL");
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables. Webhook cannot connect to Supabase.");
  // Optionally, you could throw an error here to prevent the function from running
  // throw new Error("Supabase URL or Service Role Key not configured.");
}


const stripe = Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  // @ts-ignore // Deno compatibility
  httpClient: Stripe.createFetchHttpClient(),
  apiVersion: "2023-10-16",
});

const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET")!;
const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY"); // For checking if Stripe is configured

serve(async (req: Request) => {
  const requestOrigin = req.headers.get("Origin");
  const currentCorsHeaders = getCorsHeaders(requestOrigin);

  // Handle OPTIONS immediately for CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: currentCorsHeaders });
  }

  if (!stripeSecretKey || !webhookSecret) {
     return new Response(JSON.stringify({ error: "Stripe webhook secrets not configured on server." }), {
        status: 500,
        headers: { ...currentCorsHeaders, "Content-Type": "application/json" },
    });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method Not Allowed" }), {
      status: 405,
      headers: { ...currentCorsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const signature = req.headers.get("Stripe-Signature");
    if (!signature) {
      console.error("Stripe-Signature header missing");
      return new Response(JSON.stringify({ error: "Stripe-Signature header missing" }), {
        status: 400,
        headers: { ...currentCorsHeaders, "Content-Type": "application/json" }, // Use currentCorsHeaders
      });
    }

    const rawBody = await req.text(); // Stripe needs the raw request body
    let event: Stripe.Event;

    try {
      event = await stripe.webhooks.constructEventAsync(
        rawBody,
        signature,
        webhookSecret,
        undefined,
        // @ts-ignore Deno specific crypto provider
        Stripe.createSubtleCryptoProvider()
      );
    } catch (err) {
      console.error(`Webhook signature verification failed: ${err.message}`);
      return new Response(JSON.stringify({ error: `Webhook error: ${err.message}` }), {
        status: 400,
        headers: { ...currentCorsHeaders, "Content-Type": "application/json" }, // Use currentCorsHeaders
      });
    }

    // Handle the event
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        console.log("Checkout session completed event received for session ID:", session.id);

        const clerkUserId = session.client_reference_id;
        // const session = event.data.object as Stripe.Checkout.Session; // Duplicate removed
        // console.log("Checkout session completed event received for session ID:", session.id); // Duplicate removed

        // const clerkUserId = session.client_reference_id; // Duplicate removed
        const stripeCustomerId = session.customer as string; // Ensure it's a string
        const stripeSubscriptionId = session.subscription as string; // Ensure it's a string

        // It's more reliable to fetch the subscription to get its details,
        // especially the current_period_end and the priceId.
        const subscription = await stripe.subscriptions.retrieve(stripeSubscriptionId);
        if (!subscription) {
            console.error(`Could not retrieve subscription ${stripeSubscriptionId} from Stripe.`);
            // Return 200 to Stripe to acknowledge, but log error. If we 500, Stripe retries.
            // Depending on desired behavior, 500 might be okay if we want retry for transient Stripe issues.
            return new Response(JSON.stringify({ error: "Webhook processed, but failed to retrieve subscription from Stripe." }), { status: 200, headers: { ...currentCorsHeaders, "Content-Type": "application/json" } });
        }

        const priceId = subscription.items.data[0]?.price.id;
        const currentPeriodEnd = new Date(subscription.current_period_end * 1000); // Convert Unix timestamp to JS Date
        const status = subscription.status; // e.g., 'active', 'trialing', 'past_due'

        console.log("Processing checkout.session.completed event with data:", {
          sessionId: session.id,
          clerkUserId: clerkUserId,
          stripeCustomerId: stripeCustomerId,
          stripeSubscriptionId: stripeSubscriptionId,
          priceId: priceId,
          currentPeriodEnd: currentPeriodEnd.toISOString(),
          status: status,
        });

        if (!clerkUserId || !stripeCustomerId || !stripeSubscriptionId || !priceId || !currentPeriodEnd || !status) {
          console.error("Missing critical data for database upsert after processing checkout.session.completed event:", {
            clerkUserId, stripeCustomerId, stripeSubscriptionId, priceId, currentPeriodEnd, status
          });
          return new Response(JSON.stringify({ error: "Webhook processed, but critical data for DB update was missing." }), { status: 200, headers: { ...currentCorsHeaders, "Content-Type": "application/json" } });
        }

        // Initialize Supabase client only if keys are present
        let supabaseAdmin: SupabaseClient | null = null;
        if (supabaseUrl && supabaseServiceRoleKey) {
            supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
                auth: { persistSession: false, autoRefreshToken: false }
            });
        } else {
            console.error("Supabase client not initialized due to missing env vars. Cannot update database.");
            return new Response(JSON.stringify({ error: "Webhook processed, but server not configured to save data." }), { status: 200, headers: { ...currentCorsHeaders, "Content-Type": "application/json" } });
        }

        const { data, error: dbError } = await supabaseAdmin
          .from("user_subscriptions")
          .upsert(
            {
              clerk_user_id: clerkUserId,
              stripe_customer_id: stripeCustomerId,
              stripe_subscription_id: stripeSubscriptionId,
              stripe_price_id: priceId,
              stripe_current_period_end: currentPeriodEnd.toISOString(),
              status: status,
              // updated_at will be handled by the database trigger or default to now() on insert
            },
            {
              onConflict: "stripe_subscription_id", // Conflict target
              // if you want to ignore updates on conflict and only insert if new:
              // ignoreDuplicates: true,
            }
          )
          .select(); // Optionally select the upserted data

        if (dbError) {
          console.error("Database error during upsert:", dbError);
          return new Response(JSON.stringify({ error: `Database error: ${dbError.message}` }), { status: 500, headers: { ...currentCorsHeaders, "Content-Type": "application/json" }}); // Stripe will retry on 500
        }

        console.log("Successfully upserted subscription data:", data);
        break;
      }
      // TODO: Handle other important Stripe events:
      // case 'invoice.payment_succeeded':
      //   // If subscription renewal is successful, update stripe_current_period_end and status.
      //   break;
      // case 'invoice.payment_failed':
      //   // User's payment failed for a renewal. Update status (e.g., 'past_due', 'unpaid').
      //   // Stripe will automatically retry payments based on your settings.
      //   break;
      // case 'customer.subscription.updated':
      //   // Handle changes like plan upgrades/downgrades, cancellations that are set to end of period.
      //   // The `status` and `stripe_price_id` might change here.
      //   // `cancel_at_period_end` is a key field.
      //   break;
      // case 'customer.subscription.deleted':
      //   // Subscription was canceled immediately or at period end and now is fully removed.
      //   // Update status to 'canceled'.
      //   break;
      default:
        console.log(`Unhandled event type ${event.type}`);
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { ...currentCorsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Error processing webhook:", error.message, error.stack);
    return new Response(JSON.stringify({ error: "Internal Server Error" }), {
      status: 500,
      headers: { ...currentCorsHeaders, "Content-Type": "application/json" },
    });
  }
});
