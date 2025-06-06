import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@10.17.0?target=deno"; // Use Deno-compatible Stripe
import { corsHeaders } from "../_shared/cors.ts"; // Assuming a shared CORS config

// Initialize Stripe
const stripe = Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  // @ts-ignore // Deno compatibility
  httpClient: Stripe.createFetchHttpClient(),
  apiVersion: "2023-10-16",
});

serve(async (req: Request) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Ensure the request is a POST request
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method Not Allowed" }), {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse the request body
    const { priceId, clerkUserId } = await req.json();

    if (!priceId || !clerkUserId) {
      return new Response(JSON.stringify({ error: "Missing priceId or clerkUserId" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const successUrl = Deno.env.get("SITE_URL") ? `${Deno.env.get("SITE_URL")}/payment-success?session_id={CHECKOUT_SESSION_ID}` : "http://localhost:5173/payment-success?session_id={CHECKOUT_SESSION_ID}";
    const cancelUrl = Deno.env.get("SITE_URL") ? `${Deno.env.get("SITE_URL")}/pricing` : "http://localhost:5173/pricing";


    // Create a Stripe Checkout session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: "subscription", // Assuming subscription, adjust if it's a one-time payment
      success_url: successUrl,
      cancel_url: cancelUrl,
      client_reference_id: clerkUserId, // Store Clerk User ID for webhook processing
    });

    if (!session.id) {
        throw new Error("Failed to create Stripe session: ID missing");
    }

    return new Response(JSON.stringify({ sessionId: session.id }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Error creating checkout session:", error);
    return new Response(JSON.stringify({ error: error.message || "Internal Server Error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
