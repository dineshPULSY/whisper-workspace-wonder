import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts"; // Changed import

// IMPORTANT: Set these environment variables in your Supabase Function settings
// SUPABASE_URL is generally available via Deno.env.get("SUPABASE_URL")
// SUPABASE_SERVICE_ROLE_KEY is needed if RLS is not set up for anon key to read 'user_subscriptions'
// If RLS is configured for anon key, SUPABASE_ANON_KEY can be used.
// For simplicity and common use case where this table might be protected, we'll use SERVICE_ROLE_KEY.
const supabaseUrl = Deno.env.get("SUPABASE_URL");
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");


serve(async (req: Request) => {
  const requestOrigin = req.headers.get("Origin");
  const currentCorsHeaders = getCorsHeaders(requestOrigin);

  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: currentCorsHeaders });
  }

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in function settings.");
    return new Response(JSON.stringify({ error: "Function not configured correctly." }), {
      status: 500,
      headers: { ...currentCorsHeaders, "Content-Type": "application/json" }, // Use currentCorsHeaders
    });
  }

  const supabaseAdmin: SupabaseClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    }
  });

  try {
    let clerkUserId: string | null = null;

    if (req.method === "POST") {
      const body = await req.json();
      clerkUserId = body.clerk_user_id;
    } else if (req.method === "GET") {
      const url = new URL(req.url);
      clerkUserId = url.searchParams.get("clerk_user_id");
    } else {
      return new Response(JSON.stringify({ error: "Method Not Allowed" }), {
        status: 405,
        headers: { ...currentCorsHeaders, "Content-Type": "application/json" }, // Use currentCorsHeaders
      });
    }

    if (!clerkUserId) {
      return new Response(JSON.stringify({ error: "clerk_user_id is required" }), {
        status: 400,
        headers: { ...currentCorsHeaders, "Content-Type": "application/json" }, // Use currentCorsHeaders
      });
    }

    // Query for an active subscription
    // An active subscription typically has status 'active' or 'trialing'
    // and the current period must not have ended.
    const { data, error } = await supabaseAdmin
      .from("user_subscriptions")
      .select("stripe_price_id, status, stripe_current_period_end, stripe_customer_id, stripe_subscription_id")
      .eq("clerk_user_id", clerkUserId)
      .in("status", ["active", "trialing"]) // Check for active or trialing status
      .gt("stripe_current_period_end", new Date().toISOString()) // Ensure current period hasn't ended
      .order("stripe_current_period_end", { ascending: false }) // Get the latest one if multiple (should ideally not happen for active ones)
      .limit(1)
      .maybeSingle(); // Expect at most one active subscription

    if (error) {
      console.error("Database error fetching subscription:", error);
      return new Response(JSON.stringify({ error: `Database error: ${error.message}` }), {
        status: 500,
        headers: { ...currentCorsHeaders, "Content-Type": "application/json" }, // Use currentCorsHeaders
      });
    }

    if (!data) {
      return new Response(JSON.stringify(null), { // Return null if no active subscription found
        status: 200, // Or 404 if you prefer, but 200 with null body is also common
        headers: { ...currentCorsHeaders, "Content-Type": "application/json" }, // Use currentCorsHeaders
      });
    }

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { ...currentCorsHeaders, "Content-Type": "application/json" }, // Use currentCorsHeaders
    });

  } catch (error) {
    console.error("Error fetching user subscription:", error.message, error.stack);
    return new Response(JSON.stringify({ error: "Internal Server Error" }), {
      status: 500,
      headers: { ...currentCorsHeaders, "Content-Type": "application/json" }, // Use currentCorsHeaders
    });
  }
});
