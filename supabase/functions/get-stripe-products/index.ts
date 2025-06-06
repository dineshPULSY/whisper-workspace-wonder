import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@10.17.0?target=deno";
import { getCorsHeaders } from "../_shared/cors.ts"; // Changed import

// Initialize Stripe - ensure STRIPE_SECRET_KEY is set in Function Environment Variables
const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
if (!stripeSecretKey) {
  console.error("STRIPE_SECRET_KEY environment variable not set.");
  // We could throw here, but serve will fail if stripe is not initialized.
}
const stripe = Stripe(stripeSecretKey!, {
  // @ts-ignore // Deno compatibility
  httpClient: Stripe.createFetchHttpClient(),
  apiVersion: "2023-10-16", // Use a consistent API version
});

serve(async (req: Request) => { // Renamed _req to req
  const requestOrigin = req.headers.get("Origin");
  const currentCorsHeaders = getCorsHeaders(requestOrigin);

  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: currentCorsHeaders });
  }

  if (req.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method Not Allowed" }), {
      status: 405,
      headers: { ...currentCorsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!stripeSecretKey) {
    return new Response(JSON.stringify({ error: "Stripe secret key not configured on server." }), {
        status: 500,
        headers: { ...currentCorsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    console.log("Fetching active products from Stripe...");
    const products = await stripe.products.list({
      active: true,
      expand: ['data.default_price'], // Expand default_price to get Price object
    });
    console.log(`Retrieved ${products.data.length} active products.`);

    const transformedProducts = await Promise.all(
      products.data.map(async (product: Stripe.Product) => {
        const monthlyPriceDetails = product.default_price as Stripe.Price | null; // Is an object due to expand

        let yearlyPriceDetails: Stripe.Price | null = null;
        const yearlyPriceIdFromMeta = product.metadata?.yearlyid;

        if (yearlyPriceIdFromMeta) {
          try {
            console.log(`Retrieving yearly price ID: ${yearlyPriceIdFromMeta} for product ${product.id}`);
            yearlyPriceDetails = await stripe.prices.retrieve(yearlyPriceIdFromMeta);
            console.log(`Successfully retrieved yearly price for ${product.id}`);
          } catch (e) {
            console.error(`Failed to retrieve yearly price ID ${yearlyPriceIdFromMeta} for product ${product.id}:`, e.message);
            // yearlyPriceDetails remains null, which is fine
          }
        } else {
          console.log(`No yearlyid metadata found for product ${product.id}`);
        }

        // Basic validation for monthly price
        if (!monthlyPriceDetails || typeof monthlyPriceDetails !== 'object') {
            console.warn(`Product ${product.id} (${product.name}) is missing a valid expanded default_price. Skipping monthly details.`);
        }

        return {
          id: product.id,
          name: product.name,
          description: product.description,
          active: product.active, // Should always be true due to filter, but good to include
          metadata: product.metadata, // Contains Prompts, File, size, Settings, Folder, Price (monthly display string), yearlymonth (yearly display string /month)
          monthly_price_details: monthlyPriceDetails ? {
            id: monthlyPriceDetails.id,
            unit_amount: monthlyPriceDetails.unit_amount,
            currency: monthlyPriceDetails.currency,
            // any other fields from Stripe.Price you need
          } : null,
          yearly_price_details: yearlyPriceDetails ? {
            id: yearlyPriceDetails.id,
            unit_amount: yearlyPriceDetails.unit_amount,
            currency: yearlyPriceDetails.currency,
            // any other fields from Stripe.Price you need
          } : null,
        };
      })
    );

    console.log("Successfully transformed products.");
    return new Response(JSON.stringify(transformedProducts), {
      status: 200,
      headers: { ...currentCorsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Error fetching or transforming Stripe products:", error);
    return new Response(JSON.stringify({ error: error.message || "Internal Server Error" }), {
      status: 500,
      headers: { ...currentCorsHeaders, "Content-Type": "application/json" },
    });
  }
});

// Reminder for user:
// 1. Ensure STRIPE_SECRET_KEY is set in the Supabase Function's Environment Variables.
// 2. The `../_shared/cors.ts` file should be correctly configured for your frontend domain(s).
// 3. Product metadata on Stripe should include `yearlyid` for products that have a separate yearly price.
// 4. The `default_price` on Stripe products should be set to the monthly price ID.
// 5. Product metadata should also include: Prompts, File, size, Settings, Folder, Price (display string for monthly), yearlymonth (display string for yearly /month).
//    Example metadata:
//    {
//      "Prompts": "50",
//      "File": "10MB",
//      "size": "Standard",
//      "Settings": "Basic",
//      "Folder": "Included",
//      "Price": "5", // For $5/month display
//      "yearlyid": "price_xxxxYYYYZZZZ", // Actual Stripe Price ID for the yearly plan
//      "yearlymonth": "4.17" // For $50/year -> $4.17/month display
//    }
