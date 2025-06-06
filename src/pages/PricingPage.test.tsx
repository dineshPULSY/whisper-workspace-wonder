import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom"; // Needed because PricingPage might use Link or useNavigate
import { vi } from "vitest";
import PricingPage from "./PricingPage"; // Adjust path as necessary

// --- Mocks ---

// Mock @clerk/clerk-react
vi.mock("@clerk/clerk-react", () => ({
  useAuth: vi.fn(),
  ClerkProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>, // Mock ClerkProvider if needed
  SignedIn: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SignedOut: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// Mock @stripe/stripe-js
const mockRedirectToCheckout = vi.fn();
const mockLoadStripe = vi.fn();
vi.mock("@stripe/stripe-js", () => ({
  loadStripe: mockLoadStripe,
}));

// Mock react-router-dom's useNavigate
const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// Mock useToast hook
const mockToast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: mockToast }),
}));

// Mock environment variables
vi.stubGlobal('import_meta_env', {
    VITE_STRIPE_PUBLISHABLE_KEY: "pk_test_stripe_publishable_key",
    VITE_SUPABASE_URL: "http://mock-supabase.co",
});

// --- Test Setup ---

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

const AllTheProviders = ({ children }: { children: React.ReactNode }) => {
  return (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        {/* ClerkProvider might be needed if PricingPage indirectly uses its context
            beyond what useAuth mock provides, but usually useAuth mock is enough.
            <ClerkProvider publishableKey="test_pk"> */}
          {children}
        {/* </ClerkProvider> */}
      </MemoryRouter>
    </QueryClientProvider>
  );
};

const renderPricingPage = () => {
  return render(<PricingPage />, { wrapper: AllTheProviders });
};

// Helper to mock fetch
const mockFetch = (data: any, ok = true, status = 200) => {
  global.fetch = vi.fn().mockResolvedValue({
    ok,
    status,
    json: async () => data,
    headers: new Headers({ "content-type": "application/json" }),
  });
};
const mockFetchError = (errorMsg = "Network error", status = 500) => {
   global.fetch = vi.fn().mockResolvedValue({
    ok: false,
    status,
    json: async () => ({ error: errorMsg }),
    headers: new Headers({ "content-type": "application/json" }),
  });
};


// --- Tests ---

describe("PricingPage Component", () => {
  const { useAuth: mockUseAuthClerk } = await import("@clerk/clerk-react");

  beforeEach(() => {
    vi.resetAllMocks();
    // Default to unauthenticated user
    (mockUseAuthClerk as vi.Mock).mockReturnValue({
      isSignedIn: false,
      userId: null,
      isLoaded: true,
      getToken: vi.fn().mockResolvedValue("mock_clerk_token"),
    });
    mockLoadStripe.mockResolvedValue({ redirectToCheckout: mockRedirectToCheckout });
  });

  test("renders all three plans with their details", () => {
    renderPricingPage();
    expect(screen.getByText("Starter")).toBeInTheDocument();
    expect(screen.getByText("50 prompts/month")).toBeInTheDocument();
    expect(screen.getByText("$5")).toBeInTheDocument(); // Monthly price part
    expect(screen.getByText("or $50/year")).toBeInTheDocument();

    expect(screen.getByText("Basic")).toBeInTheDocument();
    expect(screen.getByText("200 prompts/month")).toBeInTheDocument();
    expect(screen.getByText("$15")).toBeInTheDocument();
    expect(screen.getByText("or $150/year")).toBeInTheDocument();

    expect(screen.getByText("Pro")).toBeInTheDocument();
    expect(screen.getByText("1000 prompts/month")).toBeInTheDocument();
    expect(screen.getByText("$50")).toBeInTheDocument();
    expect(screen.getByText("or $500/year")).toBeInTheDocument();

    // Check for buttons (example for Starter plan)
    const starterMonthlyButtons = screen.getAllByText("Choose Monthly");
    expect(starterMonthlyButtons.length).toBeGreaterThanOrEqual(1); // At least one for Starter
  });

  test("user not authenticated: prompts to sign in on plan selection", async () => {
    renderPricingPage();
    const chooseStarterMonthlyButton = screen.getAllByText("Choose Monthly")[0]; // Get first one (Starter)
    fireEvent.click(chooseStarterMonthlyButton);

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({
        title: "Authentication Required",
        description: "Please sign in to choose a plan.",
      }));
    });
    expect(mockNavigate).toHaveBeenCalledWith("/login?mode=sign-in");
  });

  test("user authenticated, successful checkout: calls fetch and redirectToCheckout", async () => {
    (mockUseAuthClerk as vi.Mock).mockReturnValue({
      isSignedIn: true,
      userId: "user_test_id_auth_success",
      isLoaded: true,
      getToken: vi.fn().mockResolvedValue("mock_clerk_token"),
    });
    mockFetch({ sessionId: "sess_12345" });

    renderPricingPage();
    const chooseStarterMonthlyButton = screen.getAllByText("Choose Monthly")[0];
    fireEvent.click(chooseStarterMonthlyButton);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "http://mock-supabase.co/functions/v1/create-checkout-session",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            priceId: "price_1PTDOEBW9IshQPOYIY96dpIY", // Starter Monthly Price ID
            clerkUserId: "user_test_id_auth_success"
          }),
        })
      );
    });

    await waitFor(() => {
      expect(mockLoadStripe).toHaveBeenCalledWith(import_meta_env.VITE_STRIPE_PUBLISHABLE_KEY);
    });
    await waitFor(() => {
      expect(mockRedirectToCheckout).toHaveBeenCalledWith({ sessionId: "sess_12345" });
    });
  });

  test("user authenticated, failed checkout (API error): shows error toast", async () => {
    (mockUseAuthClerk as vi.Mock).mockReturnValue({
      isSignedIn: true,
      userId: "user_test_id_api_fail",
      isLoaded: true,
      getToken: vi.fn().mockResolvedValue("mock_clerk_token"),
    });
    mockFetchError("Internal Server Error", 500);

    renderPricingPage();
    const chooseBasicYearlyButton = screen.getAllByText("Choose Yearly")[1]; // Basic Yearly
    fireEvent.click(chooseBasicYearlyButton);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "http://mock-supabase.co/functions/v1/create-checkout-session",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            priceId: "price_1PuUXgBW9IshQPOYqPLPbsvn", // Basic Yearly Price ID
            clerkUserId: "user_test_id_api_fail"
          }),
        })
      );
    });

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({
        title: "Subscription Error",
        description: "Internal Server Error", // Or whatever the error from fetch is
      }));
    });
    expect(mockRedirectToCheckout).not.toHaveBeenCalled();
  });

  test("user authenticated, Stripe.js fails to load: shows error toast", async () => {
    (mockUseAuthClerk as vi.Mock).mockReturnValue({
      isSignedIn: true,
      userId: "user_test_id_stripe_fail",
      isLoaded: true,
      getToken: vi.fn().mockResolvedValue("mock_clerk_token"),
    });
    mockFetch({ sessionId: "sess_67890" }); // Checkout session creation is successful
    mockLoadStripe.mockResolvedValue(null); // Stripe.js fails to load

    renderPricingPage();
    const chooseProMonthlyButton = screen.getAllByText("Choose Monthly")[2]; // Pro Monthly
    fireEvent.click(chooseProMonthlyButton);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalled(); // Fetch for session ID should still be called
    });

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({
        title: "Subscription Error",
        description: "Stripe.js has not loaded yet.",
      }));
    });
    expect(mockRedirectToCheckout).not.toHaveBeenCalled();
  });

   test("user authenticated, redirectToCheckout fails: shows error toast", async () => {
    (mockUseAuthClerk as vi.Mock).mockReturnValue({
      isSignedIn: true,
      userId: "user_test_id_redirect_fail",
      isLoaded: true,
      getToken: vi.fn().mockResolvedValue("mock_clerk_token"),
    });
    mockFetch({ sessionId: "sess_abcde" });
    mockRedirectToCheckout.mockImplementationOnce(() => Promise.resolve({ error: { message: "Stripe redirect failed" } }));


    renderPricingPage();
    const chooseStarterMonthlyButton = screen.getAllByText("Choose Monthly")[0];
    fireEvent.click(chooseStarterMonthlyButton);

    await waitFor(() => expect(mockRedirectToCheckout).toHaveBeenCalled());

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({
        title: "Checkout Error",
        description: "Stripe redirect failed",
      }));
    });
  });

});
