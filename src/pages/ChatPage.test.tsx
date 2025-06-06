import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { vi } from "vitest";
import ChatPage from "./ChatPage"; // Adjust path as necessary
import { SettingsProvider } from "@/context/SettingsContext"; // Mock or provide simply
import { ChatProvider } from "@/context/ChatContext";       // Mock or provide simply

// --- Mocks ---

// Mock @clerk/clerk-react
vi.mock("@clerk/clerk-react", () => ({
  useAuth: vi.fn(),
}));

// Mock useSubscription hook
vi.mock("@/hooks/use-subscription", () => ({
  useSubscription: vi.fn(),
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

// Mock useToast (ChatPage might use it indirectly or directly)
const mockToast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: mockToast }),
}));

// Mock useGemini (ChatPage uses it)
vi.mock("@/hooks/use-gemini", () => ({
    useGemini: () => ({
        getSuggestions: vi.fn().mockResolvedValue([]),
        isSuggestionsLoading: false,
    }),
}));

// Mock getFileContent (ChatPage uses it)
vi.mock("@/utils/readFileContent", () => ({
    getFileContent: vi.fn().mockResolvedValue(""),
}));


// Minimal mock for SettingsProvider
const MockSettingsProvider = ({ children }: { children: React.ReactNode }) => (
  <SettingsProvider defaultChatStyle="default" defaultBotImageUrl="">{children}</SettingsProvider>
);

// Minimal mock for ChatProvider - BEWARE: ChatPage is complex. This mock needs to be good enough.
// For access control tests, we might not hit deep ChatProvider usage if redirected early.
const mockUseChatReturnValue = {
    sessions: [],
    activeSessionId: null,
    activeWorkspaceId: null,
    messages: [],
    files: [],
    isLoading: false, // Renamed to isChatContextLoading in ChatPage, ensure consistency
    isProcessing: false,
    handleSelectSession: vi.fn(),
    handleNewSession: vi.fn(),
    handleDeleteSession: vi.fn(),
    handlePinSession: vi.fn(),
    handleSendMessage: vi.fn(),
    handleFileUpload: vi.fn(),
    handleDeleteFile: vi.fn(),
    setActiveWorkspace: vi.fn(),
};
vi.mock("@/context/ChatContext", () => ({
  useChat: () => mockUseChatReturnValue, // Provide default mock values
  ChatProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));


// --- Test Setup ---

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});


// Wrapper to provide all necessary contexts
const AllTheProviders = ({ children }: { children: React.ReactNode }) => {
  return (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/chat"]}> {/* Start at /chat for testing redirects */}
        <MockSettingsProvider>
            <ChatProvider> {/* Ensure ChatProvider wraps ChatPage */}
                <Routes>
                    <Route path="/chat" element={children} />
                    <Route path="/login" element={<div>Login Page</div>} />
                    <Route path="/pricing" element={<div>Pricing Page</div>} />
                </Routes>
            </ChatProvider>
        </MockSettingsProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
};

const renderChatPage = () => {
  return render(<ChatPage />, { wrapper: AllTheProviders });
};

// --- Tests ---

describe("ChatPage Access Control", () => {
  const { useAuth: mockUseAuthClerk } = await import("@clerk/clerk-react");
  const { useSubscription: mockUseSubscriptionHook } = await import("@/hooks/use-subscription");
  const { useChat: mockUseChatContext } = await import("@/context/ChatContext");


  beforeEach(() => {
    vi.resetAllMocks();
    // Reset ChatContext mock to default for each test if needed, or override per test
     (mockUseChatContext as vi.Mock).mockReturnValue(mockUseChatReturnValue);
  });

  test("user not authenticated: redirects to login page", async () => {
    (mockUseAuthClerk as vi.Mock).mockReturnValue({ isSignedIn: false, isLoaded: true, userId: null });
    (mockUseSubscriptionHook as vi.Mock).mockReturnValue({ subscription: null, isLoading: false, isActive: false, refetch: vi.fn() });

    renderChatPage();

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith("/login?mode=sign-in");
    });
  });

  test("user authenticated, no active subscription: redirects to pricing page", async () => {
    (mockUseAuthClerk as vi.Mock).mockReturnValue({ isSignedIn: true, isLoaded: true, userId: "user_test_id" });
    (mockUseSubscriptionHook as vi.Mock).mockReturnValue({ subscription: null, isLoading: false, isActive: false, refetch: vi.fn() });

    renderChatPage();

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith("/pricing");
    });
  });

  test("user authenticated, active subscription: renders chat interface", async () => {
    (mockUseAuthClerk as vi.Mock).mockReturnValue({ isSignedIn: true, isLoaded: true, userId: "user_test_id_active" });
    (mockUseSubscriptionHook as vi.Mock).mockReturnValue({
      subscription: { stripe_price_id: 'price_test', status: 'active', stripe_current_period_end: new Date(Date.now() + 86400000).toISOString() },
      isLoading: false,
      isActive: true,
      refetch: vi.fn()
    });
     // Mock useChat to return non-empty messages or a specific element to look for
    (mockUseChatContext as vi.Mock).mockReturnValue({
        ...mockUseChatReturnValue,
        messages: [{ id: '1', role: 'user', content: 'Hello' }], // Ensure messages array is not empty
    });


    renderChatPage();

    // Verify redirect does NOT happen
    // Use waitFor to ensure component has had time to process redirects if any
    await waitFor(() => {
        expect(mockNavigate).not.toHaveBeenCalled();
    });

    // Check for an element that indicates the chat interface is rendered
    // This could be the chat input area, or a message if messages are present.
    // Using a placeholder data-testid or a known text from ChatInput/ChatMessage
    // For ChatInput, it has a textarea with placeholder "Type your message..."
    // Let's assume ChatInput is part of the rendered interface when access is granted.
    expect(screen.getByPlaceholderText("Type your message...")).toBeInTheDocument();
  });

  test("auth is loading: shows loading indicator", async () => {
    (mockUseAuthClerk as vi.Mock).mockReturnValue({ isSignedIn: false, isLoaded: false, userId: null });
    (mockUseSubscriptionHook as vi.Mock).mockReturnValue({ subscription: null, isLoading: false, isActive: false, refetch: vi.fn() });

    renderChatPage();

    // Check for the main loading spinner text or a specific data-testid for it
    expect(screen.getByText("Loading your session...")).toBeInTheDocument();
  });

  test("subscription is loading: shows loading indicator", async () => {
    (mockUseAuthClerk as vi.Mock).mockReturnValue({ isSignedIn: true, isLoaded: true, userId: "user_test_id_subload" });
    (mockUseSubscriptionHook as vi.Mock).mockReturnValue({ subscription: null, isLoading: true, isActive: false, refetch: vi.fn() });

    renderChatPage();

    expect(screen.getByText("Loading your session...")).toBeInTheDocument();
  });

  test("auth loaded, user signed in, subscription loaded but not active: redirects to pricing", async () => {
    (mockUseAuthClerk as vi.Mock).mockReturnValue({ isSignedIn: true, isLoaded: true, userId: "user_test_id_inactive" });
    (mockUseSubscriptionHook as vi.Mock).mockReturnValue({
        subscription: { stripe_price_id: 'price_test', status: 'past_due', stripe_current_period_end: new Date(Date.now() - 86400000).toISOString() },
        isLoading: false,
        isActive: false, // Key for this test
        refetch: vi.fn()
    });

    renderChatPage();

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith("/pricing");
    });
  });

});
