
import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { useAuth } from "@/components/AuthProvider";
import { SignIn, SignUp } from "@clerk/clerk-react";

export default function Login() {
  const [searchParams] = useSearchParams();
  const mode = searchParams.get("mode");
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (isAuthenticated) {
      navigate("/chat");
    }
  }, [isAuthenticated, navigate]);

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main className="flex-1 flex flex-col items-center justify-center py-12 px-4">
        <div className="flex flex-col items-center mb-8 text-center">
          <img src="/katagrafy_logo_mark.png" width={"16%"} alt="Katagrafy Logo" />
          <h1 className="text-2xl font-bold mt-4">Welcome to Katagrafy.ai</h1>
          <p className="text-muted-foreground">Your AI-powered conversation assistant</p>
        </div>
        {mode === "sign-up" ? (
          <SignUp signInUrl="/login?mode=sign-in" redirectUrl="/chat" />
        ) : (
          <SignIn signUpUrl="/login?mode=sign-up" redirectUrl="/chat" />
        )}
        <div className="mt-6 text-center text-sm text-muted-foreground">
          By continuing, you agree to our{" "}
          <a href="/terms-of-service" className="text-secondary hover:underline">
            Terms of Service
          </a>{" "}
          and{" "}
          <a href="/privacy-policy" className="text-secondary hover:underline">
            Privacy Policy
          </a>
          .
        </div>
      </main>
      <Footer />
    </div>
  );
}
