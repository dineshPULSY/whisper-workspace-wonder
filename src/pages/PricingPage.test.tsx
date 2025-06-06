import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { vi } from "vitest";
import PricingPage from "./PricingPage";

// --- Mocks ---
vi.mock("@clerk/clerk-react", () => ({
  useAuth: vi.fn(),
}));

const mockRedirectToCheckout = vi.fn();
const mockLoadStripe = vi.fn();
vi.mock("@stripe/stripe-js", () => ({
  loadStripe: mockLoadStripe,
}));

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

const mockToast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: mockToast }),
}));

// Mock useSubscription hook
const mockUseSubscription = vi.fn();
vi.mock("@/hooks/use-subscription", () => ({
  useSubscription: mockUseSubscription,
}));

vi.stubGlobal('import_meta_env', {
  VITE_STRIPE_PUBLISHABLE_KEY: "pk_test_stripe_publishable_key",
  VITE_SUPABASE_URL: "http://mock-supabase.co", // Used by fetchStripeProducts and handleChoosePlan
});

// --- Test Setup ---
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, cacheTime: 0 } }, // Disable cache for tests
});

const AllTheProviders = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={queryClient}>
    <MemoryRouter>{children}</MemoryRouter>
  </QueryClientProvider>
);

const renderPricingPage = () => {
  return render(<PricingPage />, { wrapper: AllTheProviders });
};

// Helper to mock global fetch responses
const mockApiResponse = (data: any, ok = true, status = 200) => {
  return {
    ok,
    status,
    json: async () => data,
    headers: new Headers({ "content-type": "application/json" }),
  };
};


// Sample mock product data (structure from get-stripe-products function)
const mockFetchedProductsData = [
  {
    id: "prod_starter", name: "Starter Plan", description: "Starter features", active: true,
    metadata: { Prompts: "50", File: "10", size: "S", Settings: "No", Folder: "No", Price: "5", yearlymonth: "4.17", yearlyid: "price_starter_yearly_id" },
    monthly_price_details: { id: "price_starter_monthly_id", unit_amount: 500, currency: "usd" },
    yearly_price_details: { id: "price_starter_yearly_id", unit_amount: 5000, currency: "usd" }, // Assuming $50/year = 5000 cents
  },
  {
    id: "prod_basic", name: "Basic Plan", description: "Basic features", active: true,
    metadata: { Prompts: "200", File: "50", size: "M", Settings: "Yes", Folder: "Yes", Price: "15", yearlymonth: "12.50", yearlyid: "price_basic_yearly_id" },
    monthly_price_details: { id: "price_basic_monthly_id", unit_amount: 1500, currency: "usd" },
    yearly_price_details: { id: "price_basic_yearly_id", unit_amount: 15000, currency: "usd" }, // Assuming $150/year
  },
   { // Pro plan with no yearly option for testing
    id: "prod_pro", name: "Pro Plan", description: "Pro features", active: true,
    metadata: { Prompts: "1000", File: "100", size: "L", Settings: "Yes", Folder: "Yes", Price: "50" /* No yearlyid */ },
    monthly_price_details: { id: "price_pro_monthly_id", unit_amount: 5000, currency: "usd" },
    yearly_price_details: null, // No yearly price details
  },
];


describe("PricingPage Component - Dynamic Data", () => {
  const { useAuth: mockUseAuthClerk } = await import("@clerk/clerk-react");
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.resetAllMocks();
    queryClient.clear();

    (mockUseAuthClerk as vi.Mock).mockReturnValue({
      isSignedIn: false, userId: null, isLoaded: true, getToken: vi.fn().mockResolvedValue("mock_clerk_token"),
    });
    mockLoadStripe.mockResolvedValue({ redirectToCheckout: mockRedirectToCheckout });
    mockUseSubscription.mockReturnValue({ subscription: null, isLoading: false, isActive: false, refetch: vi.fn() });

    // Default fetch mock for get-stripe-products
    global.fetch = vi.fn((url) => {
      if (String(url).includes('/functions/v1/get-stripe-products')) {
        return Promise.resolve(mockApiResponse(mockFetchedProductsData));
      }
      // Fallback for other fetches (like create-checkout-session) - can be overridden in specific tests
      return Promise.resolve(mockApiResponse({ sessionId: 'default_sess_id' }));
    }) as vi.Mock;
  });

   afterEach(() => {
    global.fetch = originalFetch; // Restore original fetch
  });


  test("shows loading state while products are being fetched", async () => {
    global.fetch = vi.fn(() => new Promise(() => {})); // Keep fetch pending
    renderPricingPage();
    expect(screen.getByText("Loading pricing plans...")).toBeInTheDocument();
    // Assuming Loader2 has a role that can be queried, e.g., progressbar
    expect(screen.getAllByRole('progressbar').length).toBeGreaterThan(0);
  });

  test("shows error message if product fetch fails", async () => {
    global.fetch = vi.fn((url) => {
        if (String(url).includes('/functions/v1/get-stripe-products')) {
             return Promise.resolve(mockApiResponse({error: "Server failed"}, false, 500));
        }
        return Promise.reject(new Error('Unhandled fetch mock'));
    }) as vi.Mock;

    renderPricingPage();
    await waitFor(() => {
      expect(screen.getByText("Error Loading Plans")).toBeInTheDocument();
    });
    expect(screen.getByText(/Details: Server failed/i)).toBeInTheDocument();
  });

  test("shows 'No plans available' if fetch is successful but returns no products", async () => {
    global.fetch = vi.fn().mockResolvedValue(mockApiResponse([])); // Empty array of products
    renderPricingPage();
    await waitFor(() => {
      expect(screen.getByText("No Plans Available")).toBeInTheDocument();
    });
  });

  test("renders dynamic product data correctly", async () => {
    renderPricingPage(); // Default fetch mock provides mockFetchedProductsData

    await waitFor(() => expect(screen.getByText("Starter Plan")).toBeInTheDocument());

    // Starter Plan checks
    expect(screen.getByText("50 prompts/month")).toBeInTheDocument();
    expect(screen.getByText("$5")).toBeInTheDocument(); // From metadata.Price
    expect(screen.getByText("$4.17 / month (billed annually)")).toBeInTheDocument(); // From metadata.yearlymonth
    expect(screen.getByText("Document Limit (S MB each): 10")).toBeInTheDocument();
    expect(screen.getByText("AI Customization: No")).toBeInTheDocument();
    expect(screen.getByText("Folder Creation: No")).toBeInTheDocument();

    // Pro Plan checks (no yearly option)
    await waitFor(() => expect(screen.getByText("Pro Plan")).toBeInTheDocument());
    expect(screen.getByText("1000 prompts/month")).toBeInTheDocument();
    expect(screen.getByText("$50")).toBeInTheDocument();
    // Check that the "Choose Yearly" button for Pro is disabled or text indicates unavailability
    const proPlanCard = screen.getByText("Pro Plan").closest('div.flex.flex-col'); // Adjust selector as needed
    if(proPlanCard){
        const yearlyButtonForPro = Array.from(proPlanCard.querySelectorAll('button')).find(btn => btn.textContent?.includes("Yearly"));
        expect(yearlyButtonForPro).toBeInTheDocument();
        expect(yearlyButtonForPro).toBeDisabled(); // Because yearlyPriceId is null for Pro in mock
    }


    const chooseMonthlyButtons = screen.getAllByText("Choose Monthly");
    expect(chooseMonthlyButtons.length).toBe(mockFetchedProductsData.length);
  });

  test("'Current Plan' is displayed for active monthly subscription", async () => {
    (mockUseAuthClerk as vi.Mock).mockReturnValue({ isSignedIn: true, userId: "user_123", isLoaded: true });
    mockUseSubscription.mockReturnValue({
      subscription: { stripe_price_id: "price_basic_monthly_id" },
      isActive: true, isLoading: false
    });
    renderPricingPage();

    await waitFor(() => {
      const basicPlanCard = screen.getByText("Basic Plan").closest('div.flex.flex-col');
      if (!basicPlanCard) throw new Error("Basic plan card not found");

      const currentPlanButton = Array.from(basicPlanCard.querySelectorAll('button')).find(btn => btn.textContent === "Current Plan");
      expect(currentPlanButton).toBeInTheDocument();
      expect(currentPlanButton).toBeDisabled();
    });
  });

  test("'Current Plan' is displayed for active yearly subscription", async () => {
    (mockUseAuthClerk as vi.Mock).mockReturnValue({ isSignedIn: true, userId: "user_123", isLoaded: true });
    mockUseSubscription.mockReturnValue({
      subscription: { stripe_price_id: "price_starter_yearly_id" },
      isActive: true, isLoading: false
    });
    renderPricingPage();

    await waitFor(() => {
      const starterPlanCard = screen.getByText("Starter Plan").closest('div.flex.flex-col');
      if (!starterPlanCard) throw new Error("Starter plan card not found");

      const yearlyButtons = Array.from(starterPlanCard.querySelectorAll('button'));
      const currentPlanButton = yearlyButtons.find(btn => btn.textContent === "Current Plan" && btn.innerHTML.includes("Yearly")); // Check it's the yearly one
      // This check is a bit fragile. If button structure changes, this might fail.
      // A more robust way would be specific data-testid for monthly/yearly buttons.
      expect(currentPlanButton).toBeInTheDocument();
      expect(currentPlanButton).toBeDisabled();
    });
  });

  test("handleChoosePlan called with correct dynamic priceId for yearly plan", async () => {
    (mockUseAuthClerk as vi.Mock).mockReturnValue({ isSignedIn: true, userId: "user_choose_plan", isLoaded: true });

    // Override global.fetch for this specific test to also mock create-checkout-session
    global.fetch = vi.fn((url) => {
      if (String(url).includes('/functions/v1/get-stripe-products')) {
        return Promise.resolve(mockApiResponse(mockFetchedProductsData));
      }
      if (String(url).includes('/functions/v1/create-checkout-session')) {
        return Promise.resolve(mockApiResponse({ sessionId: "sess_dynamic_checkout" }));
      }
      return Promise.reject(new Error(`Unhandled fetch mock for URL: ${url}`));
    }) as vi.Mock;

    renderPricingPage();
    await waitFor(() => expect(screen.getByText("Basic Plan")).toBeInTheDocument());

    const basicPlanCard = screen.getByText("Basic Plan").closest('div.flex.flex-col');
    if (!basicPlanCard) throw new Error("Basic plan card not found");
    const chooseBasicYearlyButton = Array.from(basicPlanCard.querySelectorAll('button')).find(btn => btn.textContent === "Choose Yearly");
    if (!chooseBasicYearlyButton) throw new Error("Choose Yearly button for Basic plan not found");

    fireEvent.click(chooseBasicYearlyButton);

    await waitFor(() => {
      const fetchCalls = (global.fetch as vi.Mock).mock.calls;
      const checkoutCall = fetchCalls.find(call => String(call[0]).includes('create-checkout-session'));
      expect(checkoutCall).toBeDefined();
      expect(checkoutCall[1].method).toBe("POST");
      expect(JSON.parse(checkoutCall[1].body)).toEqual({
        priceId: "price_basic_yearly_id",
        clerkUserId: "user_choose_plan"
      });
    });
    await waitFor(() => {
      expect(mockRedirectToCheckout).toHaveBeenCalledWith({ sessionId: "sess_dynamic_checkout" });
    });
  });

  // Test for user not authenticated (dynamic data)
  test("user not authenticated: prompts to sign in (dynamic data)", async () => {
    // useAuth is already mocked for unauthenticated by default in beforeEach
    renderPricingPage(); // Default fetch mock provides products
    await waitFor(() => expect(screen.getByText("Starter Plan")).toBeInTheDocument());

    const chooseStarterMonthlyButton = screen.getAllByText("Choose Monthly")[0];
    fireEvent.click(chooseStarterMonthlyButton);

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({
        title: "Authentication Required",
      }));
    });
    expect(mockNavigate).toHaveBeenCalledWith("/login?mode=sign-in");
  });

  // Test for Stripe.js failing to load (dynamic data)
  test("user authenticated, Stripe.js fails to load (dynamic data)", async () => {
    (mockUseAuthClerk as vi.Mock).mockReturnValue({ isSignedIn: true, userId: "user_stripe_fail", isLoaded: true });
    global.fetch = vi.fn((url) => { // Mock fetch for both product and checkout session
      if (String(url).includes('/functions/v1/get-stripe-products')) {
        return Promise.resolve(mockApiResponse(mockFetchedProductsData));
      }
      if (String(url).includes('/functions/v1/create-checkout-session')) {
        return Promise.resolve(mockApiResponse({ sessionId: "sess_stripe_fail" }));
      }
      return Promise.reject(new Error('Unhandled fetch mock'));
    }) as vi.Mock;
    mockLoadStripe.mockResolvedValue(null); // Stripe.js fails to load

    renderPricingPage();
    await waitFor(() => expect(screen.getByText("Starter Plan")).toBeInTheDocument());
    const chooseStarterMonthlyButton = screen.getAllByText("Choose Monthly")[0];
    fireEvent.click(chooseStarterMonthlyButton);

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({
        title: "Subscription Error",
        description: "Stripe.js has not loaded yet.",
      }));
    });
    expect(mockRedirectToCheckout).not.toHaveBeenCalled();
  });
});
