
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ClerkProvider, SignedIn, SignedOut, RedirectToSignIn } from "@clerk/clerk-react";
import { ThemeProvider } from "@/components/ThemeProvider";
import { ChatProvider } from "@/context/ChatContext";
import { SettingsProvider } from "@/context/SettingsContext";
import Index from "./pages/Index";
import Login from "./pages/Login";
import ChatPage from "./pages/ChatPage";
import WorkspacePage from "./pages/WorkspacePage";
import FAQPage from "./pages/FAQPage";
import NotFound from "./pages/NotFound";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import TermsOfService from "./pages/TermsOfService";
import PricingPage from "./pages/PricingPage";

// Create a new QueryClient instance
const queryClient = new QueryClient();

// Get the publishable key from the environment variable
const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

// Wrap the App component in a function declaration
function App() {
  if (!PUBLISHABLE_KEY) {
    throw new Error("Missing Publishable Key");
  }
  return (
    <ClerkProvider publishableKey={PUBLISHABLE_KEY}>
      <BrowserRouter>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider defaultTheme="light">
            <TooltipProvider>
              <Toaster />
              <Sonner />
              <Routes>
                <Route path="/" element={<Index />} />
                <Route
                  path="/login"
                  element={
                    <>
                      <SignedIn>
                        <Navigate to="/chat" replace />
                      </SignedIn>
                      <SignedOut>
                        <Login />
                      </SignedOut>
                    </>
                  }
                />
                <Route
                  path="/chat"
                  element={
                    <>
                      <SignedIn>
                        <SettingsProvider>
                          <ChatProvider>
                            <ChatPage />
                          </ChatProvider>
                        </SettingsProvider>
                      </SignedIn>
                      <SignedOut>
                        <RedirectToSignIn />
                      </SignedOut>
                    </>
                  }
                />
                <Route
                  path="/workspace"
                  element={
                    <>
                      <SignedIn>
                        <WorkspacePage />
                      </SignedIn>
                      <SignedOut>
                        <RedirectToSignIn />
                      </SignedOut>
                    </>
                  }
                />
                <Route path="/faq" element={<FAQPage />} />
                <Route path="/pricing" element={<PricingPage />} />
                <Route path="/privacy-policy" element={<PrivacyPolicy />} />
                <Route path="/terms-of-service" element={<TermsOfService />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </TooltipProvider>
          </ThemeProvider>
        </QueryClientProvider>
      </BrowserRouter>
    </ClerkProvider>
  );
}

export default App;
