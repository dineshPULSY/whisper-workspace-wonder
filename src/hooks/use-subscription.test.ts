import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { vi } from "vitest";
import { useSubscription } from "./use-subscription"; // Adjust path as necessary

// Mock @clerk/clerk-react
vi.mock("@clerk/clerk-react", () => ({
  useAuth: vi.fn(),
}));

// Mock environment variables (if your hook uses import.meta.env)
// Vitest by default doesn't polyfill import.meta.env but vite client does
// For testing, we can mock it or ensure build step handles it.
// Here, we assume VITE_SUPABASE_URL is used by the hook.
vi.stubGlobal('import_meta_env', {
    VITE_SUPABASE_URL: "http://mock-supabase.co",
});


const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false, // Disable retries for testing to get faster failures
      },
    },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
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

const mockFetchError = (errorMsg = "Network error") => {
  global.fetch = vi.fn().mockRejectedValue(new Error(errorMsg));
};


describe("useSubscription Hook", () => {
  const { useAuth: mockUseAuth } = await import("@clerk/clerk-react");

  beforeEach(() => {
    vi.resetAllMocks(); // Reset mocks before each test
    // Default mock for useAuth, can be overridden in specific tests
    (mockUseAuth as vi.Mock).mockReturnValue({
      isSignedIn: false,
      userId: null,
      isLoaded: true,
      getToken: vi.fn().mockResolvedValue("mock_token"),
    });
  });

  test("unauthenticated user: does not fetch and returns empty state", async () => {
    const { result } = renderHook(() => useSubscription(), { wrapper: createWrapper() });

    expect(result.current.subscription).toBeUndefined(); // Or null, depending on initial state of useQuery
    expect(result.current.isLoading).toBe(false); // Should not be loading as query is disabled
    expect(result.current.isActive).toBe(false);
    expect(result.current.isTrialing).toBe(false);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test("authenticated user, no active subscription: returns null subscription, isActive false", async () => {
    (mockUseAuth as vi.Mock).mockReturnValue({
      isSignedIn: true,
      userId: "user_test_id",
      isLoaded: true,
      getToken: vi.fn().mockResolvedValue("mock_token"),
    });
    mockFetch(null); // Supabase function returns null for no subscription

    const { result } = renderHook(() => useSubscription(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.subscription).toBeNull();
    expect(result.current.isActive).toBe(false);
    expect(result.current.isTrialing).toBe(false);
    expect(global.fetch).toHaveBeenCalledWith(
      "http://mock-supabase.co/functions/v1/get-user-subscription",
      expect.any(Object)
    );
  });

  test("authenticated user, active subscription: returns subscription data, isActive true", async () => {
    const activeSubData = {
      stripe_price_id: "price_starter_monthly",
      status: "active",
      stripe_current_period_end: new Date(Date.now() + 86400000).toISOString(), // Future date
      stripe_customer_id: "cus_test",
      stripe_subscription_id: "sub_test_active",
    };
    (mockUseAuth as vi.Mock).mockReturnValue({
      isSignedIn: true,
      userId: "user_test_id_active",
      isLoaded: true,
      getToken: vi.fn().mockResolvedValue("mock_token"),
    });
    mockFetch(activeSubData);

    const { result } = renderHook(() => useSubscription(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.subscription).toEqual(activeSubData);
    expect(result.current.isActive).toBe(true);
    expect(result.current.isTrialing).toBe(false);
  });

  test("authenticated user, trialing subscription: returns subscription data, isActive and isTrialing true", async () => {
    const trialingSubData = {
      stripe_price_id: "price_pro_monthly",
      status: "trialing",
      stripe_current_period_end: new Date(Date.now() + 86400000).toISOString(), // Future date
      stripe_customer_id: "cus_test_trial",
      stripe_subscription_id: "sub_test_trialing",
    };
    (mockUseAuth as vi.Mock).mockReturnValue({
      isSignedIn: true,
      userId: "user_test_id_trialing",
      isLoaded: true,
      getToken: vi.fn().mockResolvedValue("mock_token"),
    });
    mockFetch(trialingSubData);

    const { result } = renderHook(() => useSubscription(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.subscription).toEqual(trialingSubData);
    expect(result.current.isActive).toBe(true);
    expect(result.current.isTrialing).toBe(true);
  });

  test("authenticated user, past_due subscription: returns subscription data, isActive false", async () => {
    const pastDueSubData = {
      stripe_price_id: "price_basic_monthly",
      status: "past_due",
      stripe_current_period_end: new Date(Date.now() - 86400000).toISOString(), // Past date
      stripe_customer_id: "cus_test_pastdue",
      stripe_subscription_id: "sub_test_pastdue",
    };
    (mockUseAuth as vi.Mock).mockReturnValue({
      isSignedIn: true,
      userId: "user_test_id_pastdue",
      isLoaded: true,
      getToken: vi.fn().mockResolvedValue("mock_token"),
    });
    mockFetch(pastDueSubData);

    const { result } = renderHook(() => useSubscription(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.subscription).toEqual(pastDueSubData);
    expect(result.current.isActive).toBe(false); // Based on status 'past_due'
    expect(result.current.isTrialing).toBe(false);
  });

  test("API error during fetch: populates error state", async () => {
    (mockUseAuth as vi.Mock).mockReturnValue({
      isSignedIn: true,
      userId: "user_test_id_error",
      isLoaded: true,
      getToken: vi.fn().mockResolvedValue("mock_token"),
    });
    mockFetchError("API unavailable");

    const { result } = renderHook(() => useSubscription(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.error).toBeInstanceOf(Error);
    expect((result.current.error as Error).message).toBe("API unavailable");
    expect(result.current.subscription).toBeUndefined(); // Or null, depending on how useQuery handles error initial data
    expect(result.current.isActive).toBe(false);
  });

  test("API returns non-200 error: populates error state", async () => {
    (mockUseAuth as vi.Mock).mockReturnValue({
      isSignedIn: true,
      userId: "user_test_id_non200",
      isLoaded: true,
      getToken: vi.fn().mockResolvedValue("mock_token"),
    });
    mockFetch({ error: "Unauthorized" }, false, 401);

    const { result } = renderHook(() => useSubscription(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.error).toBeInstanceOf(Error);
    expect((result.current.error as Error).message).toContain("Unauthorized"); // Or exact message from fetchUserSubscription
    expect(result.current.subscription).toBeUndefined();
    expect(result.current.isActive).toBe(false);
  });
});
