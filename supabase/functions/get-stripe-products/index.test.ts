import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { assertEquals, assertExists, assert } from "https://deno.land/std@0.177.0/testing/asserts.ts";
import { vi } from "npm:vitest"; // Using npm package for Vitest in Deno test
import Stripe from "https://esm.sh/stripe@10.17.0?target=deno";

// --- Mocks ---

// Mock the Stripe SDK
const mockStripeProductsList = vi.fn();
const mockStripePricesRetrieve = vi.fn();

vi.mock("https://esm.sh/stripe@10.17.0?target=deno", () => {
  // console.log("Stripe SDK is being mocked"); // Debug log
  const StripeMock = vi.fn().mockImplementation(() => ({
    products: {
      list: mockStripeProductsList,
    },
    prices: {
      retrieve: mockStripePricesRetrieve,
    },
  }));
  // @ts-ignore
  StripeMock.createFetchHttpClient = vi.fn();
  // @ts-ignore
  StripeMock.createSubtleCryptoProvider = vi.fn(); // If needed by other parts of Stripe SDK
  return { default: StripeMock };
});


// Mock CORS headers (if your actual shared/cors.ts is complex, simplify here)
vi.mock("../_shared/cors.ts", () => ({
  corsHeaders: {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
  },
}));

// Mock Deno.env.get for STRIPE_SECRET_KEY
const originalEnvGet = Deno.env.get;
const mockEnvGet = vi.fn();

// --- Test Runner ---
// Import the server function from your index.ts. The path should be relative to this test file.
// Assuming the test file is in supabase/functions/get-stripe-products/
// and the function is in supabase/functions/get-stripe-products/index.ts
// The import will trigger the Deno.env.get at the top level of the function file.
let serverInstance: typeof serve | undefined;


// --- Test Suite ---
describe("Supabase Function: get-stripe-products", () => {
  beforeEach(async () => {
    vi.resetAllMocks();
    Deno.env.get = mockEnvGet; // Override Deno.env.get
    mockEnvGet.mockImplementation((key: string) => {
      if (key === "STRIPE_SECRET_KEY") return "sk_test_mockkey";
      return originalEnvGet(key); // Fallback for other env vars
    });
    // Dynamically import server after mocks are set up
    const module = await import("./index.ts?ts=" + Date.now()); // Cache bust import
    serverInstance = module.default; // Default export is `serve`
  });

  afterEach(() => {
    Deno.env.get = originalEnvGet; // Restore original Deno.env.get
    serverInstance = undefined;
  });


  test("OPTIONS request: returns correct CORS headers", async () => {
    assertExists(serverInstance, "Server instance should be defined");
    const request = new Request("http://localhost/get-stripe-products", { method: "OPTIONS" });
    const response = await serverInstance(request);

    assertEquals(response.status, 200);
    assertEquals(response.headers.get("Access-Control-Allow-Origin"), "*");
    assertEquals(response.headers.get("Access-Control-Allow-Methods"), "GET, OPTIONS");
  });

  test("Non-GET request: returns 405 Method Not Allowed", async () => {
     assertExists(serverInstance);
    const request = new Request("http://localhost/get-stripe-products", { method: "POST" });
    const response = await serverInstance(request);
    const body = await response.json();

    assertEquals(response.status, 405);
    assertEquals(body.error, "Method Not Allowed");
  });

  test("STRIPE_SECRET_KEY not set: returns 500 error", async () => {
    mockEnvGet.mockImplementation((key: string) => {
      if (key === "STRIPE_SECRET_KEY") return undefined; // Simulate not set
      return originalEnvGet(key);
    });
    // Re-import or re-initialize the module to pick up new env var state
    const module = await import("./index.ts?ts=" + Date.now());
    serverInstance = module.default;
    assertExists(serverInstance);

    const request = new Request("http://localhost/get-stripe-products", { method: "GET" });
    const response = await serverInstance(request);
    const body = await response.json();

    assertEquals(response.status, 500);
    assertEquals(body.error, "Stripe secret key not configured on server.");
  });


  test("Successful fetch: transforms and returns product data", async () => {
    assertExists(serverInstance);
    const mockProducts = {
      data: [
        {
          id: "prod_1", name: "Basic Plan", description: "Basic features", active: true,
          default_price: { id: "price_monthly_basic", unit_amount: 1000, currency: "usd" },
          metadata: { yearlyid: "price_yearly_basic", Prompts: "100", Price: "10" },
        },
        {
          id: "prod_2", name: "Pro Plan", description: "Pro features", active: true,
          default_price: { id: "price_monthly_pro", unit_amount: 2000, currency: "usd" },
          metadata: { yearlyid: "price_yearly_pro", Prompts: "500", Price: "20" },
        },
      ],
    };
    mockStripeProductsList.mockResolvedValue(mockProducts);
    mockStripePricesRetrieve
      .mockResolvedValueOnce({ id: "price_yearly_basic", unit_amount: 10000, currency: "usd" }) // For prod_1
      .mockResolvedValueOnce({ id: "price_yearly_pro", unit_amount: 20000, currency: "usd" }); // For prod_2

    const request = new Request("http://localhost/get-stripe-products", { method: "GET" });
    const response = await serverInstance(request);
    const body = await response.json();

    assertEquals(response.status, 200);
    assertEquals(body.length, 2);

    assertEquals(body[0].id, "prod_1");
    assertEquals(body[0].name, "Basic Plan");
    assertExists(body[0].monthly_price_details);
    assertEquals(body[0].monthly_price_details.id, "price_monthly_basic");
    assertEquals(body[0].monthly_price_details.unit_amount, 1000);
    assertExists(body[0].yearly_price_details);
    assertEquals(body[0].yearly_price_details.id, "price_yearly_basic");
    assertEquals(body[0].yearly_price_details.unit_amount, 10000);
    assertEquals(body[0].metadata.Prompts, "100");

    assertEquals(body[1].id, "prod_2");
    assertExists(body[1].yearly_price_details);
    assertEquals(body[1].yearly_price_details.id, "price_yearly_pro");
  });

  test("Product with no yearlyid: yearly_price_details is null", async () => {
    assertExists(serverInstance);
    const mockProducts = {
      data: [
        {
          id: "prod_no_yearly", name: "Monthly Only Plan", description: "No yearly option", active: true,
          default_price: { id: "price_monthly_only", unit_amount: 500, currency: "usd" },
          metadata: { Prompts: "50", Price: "5" }, // No yearlyid
        },
      ],
    };
    mockStripeProductsList.mockResolvedValue(mockProducts);
    // prices.retrieve should not be called for this product

    const request = new Request("http://localhost/get-stripe-products", { method: "GET" });
    const response = await serverInstance(request);
    const body = await response.json();

    assertEquals(response.status, 200);
    assertEquals(body.length, 1);
    assertEquals(body[0].id, "prod_no_yearly");
    assertExists(body[0].monthly_price_details);
    assertEquals(body[0].yearly_price_details, null);
    assert(mockStripePricesRetrieve.mock.calls.length === 0, "Stripe prices.retrieve should not have been called");
  });

  test("stripe.prices.retrieve fails for yearlyid: yearly_price_details is null", async () => {
     assertExists(serverInstance);
    const mockProducts = {
      data: [
        {
          id: "prod_yearly_fail", name: "Yearly Fail Plan", description: "Yearly price fetch fails", active: true,
          default_price: { id: "price_monthly_fail", unit_amount: 1200, currency: "usd" },
          metadata: { yearlyid: "price_yearly_invalid", Prompts: "120", Price: "12" },
        },
      ],
    };
    mockStripeProductsList.mockResolvedValue(mockProducts);
    mockStripePricesRetrieve.mockRejectedValueOnce(new Error("Failed to retrieve price"));

    const request = new Request("http://localhost/get-stripe-products", { method: "GET" });
    const response = await serverInstance(request);
    const body = await response.json();

    assertEquals(response.status, 200); // Function should still succeed overall
    assertEquals(body.length, 1);
    assertEquals(body[0].id, "prod_yearly_fail");
    assertExists(body[0].monthly_price_details);
    assertEquals(body[0].yearly_price_details, null); // Yearly details should be null
    assert(mockStripePricesRetrieve.mock.calls.length === 1, "Stripe prices.retrieve should have been called once");
  });

  test("stripe.products.list returns empty: returns empty array", async () => {
     assertExists(serverInstance);
    mockStripeProductsList.mockResolvedValue({ data: [] }); // Empty data array

    const request = new Request("http://localhost/get-stripe-products", { method: "GET" });
    const response = await serverInstance(request);
    const body = await response.json();

    assertEquals(response.status, 200);
    assertEquals(body.length, 0);
  });

  test("Stripe API error (products.list throws): returns 500", async () => {
     assertExists(serverInstance);
    mockStripeProductsList.mockRejectedValueOnce(new Error("Stripe API is down"));

    const request = new Request("http://localhost/get-stripe-products", { method: "GET" });
    const response = await serverInstance(request);
    const body = await response.json();

    assertEquals(response.status, 500);
    assertEquals(body.error, "Stripe API is down");
  });
});
