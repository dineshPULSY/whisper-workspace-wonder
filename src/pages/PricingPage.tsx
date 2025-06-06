import { useState } from "react";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@clerk/clerk-react";
import { loadStripe } from "@stripe/stripe-js";
import { useToast } from "@/hooks/use-toast"; // Assuming you have a toast hook
import { Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";


interface Plan {
  name: string;
  prompts: string;
  monthlyPriceDisplay: number;
  yearlyPriceDisplay: number;
  monthlyPriceId: string;
  yearlyPriceId: string;
  features: string[];
}

const plans: Plan[] = [
  {
    name: "Starter",
    prompts: "50 prompts/month",
    monthlyPriceDisplay: 5,
    yearlyPriceDisplay: 50,
    monthlyPriceId: "price_1PTDOEBW9IshQPOYIY96dpIY",
    yearlyPriceId: "price_1PuUW9BW9IshQPOYxjEGWGdx",
    features: ["Access to basic features", "Email support"],
  },
  {
    name: "Basic",
    prompts: "200 prompts/month",
    monthlyPriceDisplay: 15,
    yearlyPriceDisplay: 150,
    monthlyPriceId: "price_1PRPTDBW9IshQPOY344HAEeB",
    yearlyPriceId: "price_1PuUXgBW9IshQPOYqPLPbsvn",
    features: ["Access to standard features", "Priority email support", "Access to new features"],
  },
  {
    name: "Pro",
    prompts: "1000 prompts/month",
    monthlyPriceDisplay: 50,
    yearlyPriceDisplay: 500,
    monthlyPriceId: "price_1PRPUnBW9IshQPOY8lWSpbpb",
    yearlyPriceId: "price_1PXbcfBW9IshQPOYIVhgP6lD",
    features: ["Access to all features", "Dedicated support", "Early access to beta features"],
  },
];

// Ensure VITE_STRIPE_PUBLISHABLE_KEY is available
const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY!);

export default function PricingPage() {
  const { userId, isSignedIn } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [loadingPriceId, setLoadingPriceId] = useState<string | null>(null);

  const handleChoosePlan = async (priceId: string) => {
    if (!isSignedIn || !userId) {
      toast({
        title: "Authentication Required",
        description: "Please sign in to choose a plan.",
        variant: "destructive",
      });
      navigate("/login?mode=sign-in"); // Redirect to login
      return;
    }

    setLoadingPriceId(priceId);

    try {
      // Replace with your Supabase project URL or ensure relative path works with proxy
      // const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      // const checkoutUrl = `${supabaseUrl}/functions/v1/create-checkout-session`;
      const checkoutUrl = `/functions/v1/create-checkout-session`;


      const response = await fetch(checkoutUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // Supabase anon key might be needed depending on function security
          // "apikey": import.meta.env.VITE_SUPABASE_ANON_KEY!,
          // Authorization header for RLS if user is involved in function logic beyond client_reference_id
          // "Authorization": `Bearer ${await getToken({ template: 'supabase' })}`
        },
        body: JSON.stringify({ priceId, clerkUserId: userId }),
      });

      if (!response.ok) {
        const errorBody = await response.json();
        throw new Error(errorBody.error || `HTTP error! status: ${response.status}`);
      }

      const { sessionId } = await response.json();

      if (!sessionId) {
        throw new Error("Failed to retrieve session ID.");
      }

      const stripe = await stripePromise;
      if (!stripe) {
        throw new Error("Stripe.js has not loaded yet.");
      }

      const { error } = await stripe.redirectToCheckout({ sessionId });

      if (error) {
        console.error("Stripe redirectToCheckout error:", error);
        toast({
          title: "Checkout Error",
          description: error.message || "An unexpected error occurred during checkout.",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      console.error("Failed to create checkout session:", error);
      toast({
        title: "Subscription Error",
        description: error.message || "Could not initiate the subscription process. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoadingPriceId(null);
    }
  };

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main className="flex-1 py-12 px-4 md:px-6">
        <section className="text-center mb-12">
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">Pricing Plans</h1>
          <p className="mt-3 text-lg text-muted-foreground sm:mt-4">
            Choose the best plan that fits your needs. Cancel anytime.
          </p>
        </section>

        <div className="grid grid-cols-1 gap-8 md:grid-cols-3 lg:gap-12">
          {plans.map((plan) => (
            <Card key={plan.name} className="flex flex-col">
              <CardHeader className="text-center">
                <CardTitle className="text-2xl font-semibold">{plan.name}</CardTitle>
                <CardDescription>{plan.prompts}</CardDescription>
              </CardHeader>
              <CardContent className="flex-1">
                <div className="text-center mb-6">
                  <h3 className="text-3xl font-bold">${plan.monthlyPriceDisplay}<span className="text-sm font-normal text-muted-foreground">/month</span></h3>
                  <p className="text-muted-foreground mt-1">or ${plan.yearlyPriceDisplay}/year</p>
                </div>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-center">
                      <svg className="w-4 h-4 mr-2 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"></path>
                      </svg>
                      {feature}
                    </li>
                  ))}
                </ul>
              </CardContent>
              <CardFooter className="flex flex-col space-y-2 sm:flex-row sm:space-y-0 sm:space-x-2">
                <Button
                  className="w-full"
                  onClick={() => handleChoosePlan(plan.monthlyPriceId)}
                  disabled={loadingPriceId === plan.monthlyPriceId}
                >
                  {loadingPriceId === plan.monthlyPriceId ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    "Choose Monthly"
                  )}
                </Button>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => handleChoosePlan(plan.yearlyPriceId)}
                  disabled={loadingPriceId === plan.yearlyPriceId}
                >
                  {loadingPriceId === plan.yearlyPriceId ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    "Choose Yearly"
                  )}
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      </main>
      <Footer />
    </div>
  );
}
