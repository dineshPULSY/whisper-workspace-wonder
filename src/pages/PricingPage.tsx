import { useState, useMemo } from "react";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@clerk/clerk-react";
import { loadStripe } from "@stripe/stripe-js";
import { useToast } from "@/hooks/use-toast";
import { Loader2, AlertCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useSubscription } from "@/hooks/use-subscription"; // For checking current plan

// --- Interfaces for fetched Stripe product data ---
interface StripePriceDetails {
  id: string;
  unit_amount: number | null;
  currency: string;
}

interface StripeProduct {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  metadata: {
    [key: string]: string; // Prompts, File, size, Settings, Folder, Price, yearlymonth, yearlyid etc.
  };
  monthly_price_details: StripePriceDetails | null;
  yearly_price_details: StripePriceDetails | null;
}

// --- Interface for display-transformed tier ---
interface DisplayTier {
  id: string; // Stripe Product ID
  name: string;
  promptsDescription: string;
  monthlyPriceDisplay: string; // e.g., "$5"
  yearlyPriceDisplay: string;  // e.g., "$4.17 / month if paid yearly"
  monthlyPriceId: string | null;
  yearlyPriceId: string | null;
  features: string[];
  isCurrentMonthlyPlan: boolean;
  isCurrentYearlyPlan: boolean;
}

// Helper function for metadata
const folderYesNo = (value: string | undefined): string => (value && value.toLowerCase() === 'yes' ? 'Yes' : 'No');

// Ensure VITE_STRIPE_PUBLISHABLE_KEY is available
const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY!);

// --- Data fetching function ---
const fetchStripeProducts = async (): Promise<StripeProduct[]> => {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  if (!supabaseUrl) {
    throw new Error("Supabase URL is not configured. Set VITE_SUPABASE_URL.");
  }
  const response = await fetch(`${supabaseUrl}/functions/v1/get-stripe-products`);
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: "Failed to fetch products and parse error" }));
    throw new Error(errorData.error || `Failed to fetch products: ${response.statusText}`);
  }
  return response.json();
};


export default function PricingPage() {
  const { userId, isSignedIn } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [loadingPriceId, setLoadingPriceId] = useState<string | null>(null);
  const { subscription } = useSubscription(); // Get current user subscription

  const {
    data: fetchedProductsData,
    isLoading: isLoadingProducts,
    error: productsError
  } = useQuery<StripeProduct[], Error>({ // Explicitly type useQuery if needed
    queryKey: ['stripeProducts'],
    queryFn: fetchStripeProducts,
    staleTime: 1000 * 60 * 30, // Cache for 30 minutes
    refetchOnWindowFocus: false,
  });

  const displayTiers = useMemo((): DisplayTier[] => {
    if (!fetchedProductsData) return [];

    // Sort products: Basic, Starter, Pro (example - adjust based on actual names or metadata)
    // This simple sort assumes names like "Basic Plan", "Starter Plan", "Pro Plan"
    // A more robust way might be a 'sortOrder' field in metadata.
    const sortedProducts = [...fetchedProductsData].sort((a, b) => {
        const nameA = a.name.toLowerCase();
        const nameB = b.name.toLowerCase();
        const order: { [key: string]: number } = { 'starter': 1, 'basic': 2, 'pro': 3 };

        let orderA = Object.keys(order).find(key => nameA.includes(key)) ? order[Object.keys(order).find(key => nameA.includes(key))!] : 99;
        let orderB = Object.keys(order).find(key => nameB.includes(key)) ? order[Object.keys(order).find(key => nameB.includes(key))!] : 99;

        return orderA - orderB;
    });


    return sortedProducts.map(product => {
      const monthlyPriceId = product.monthly_price_details?.id || null;
      const yearlyPriceId = product.yearly_price_details?.id || null;

      // Construct yearly display string. Example: "$X.XX / month (billed annually)"
      let yearlyDisplay = "Yearly option available"; // Default
      if (product.yearly_price_details?.unit_amount && product.metadata?.yearlymonth) {
        yearlyDisplay = `$${product.metadata.yearlymonth} / month (billed annually)`;
      } else if (product.yearly_price_details?.unit_amount) {
         // Fallback if yearlymonth metadata is missing but yearly price exists
        const yearlyAmountPerMonth = (product.yearly_price_details.unit_amount / 100 / 12).toFixed(2);
        yearlyDisplay = `$${yearlyAmountPerMonth} / month (billed annually)`;
      }


      return {
        id: product.id,
        name: product.name,
        promptsDescription: `${product.metadata?.Prompts || 'N/A'} prompts/month`,
        monthlyPriceDisplay: product.metadata?.Price ? `$${product.metadata.Price}` : "N/A",
        yearlyPriceDisplay: yearlyDisplay,
        monthlyPriceId: monthlyPriceId,
        yearlyPriceId: yearlyPriceId,
        features: [
          `Document Limit (${product.metadata?.size || 'N/A'} MB each): ${product.metadata?.File || 'N/A'}`,
          `AI Customization: ${folderYesNo(product.metadata?.Settings)}`,
          `Folder Creation: ${folderYesNo(product.metadata?.Folder)}`,
          // Add more static or metadata-driven features here
          "Email support",
        ],
        isCurrentMonthlyPlan: subscription?.stripe_price_id === monthlyPriceId,
        isCurrentYearlyPlan: subscription?.stripe_price_id === yearlyPriceId,
      };
    });
  }, [fetchedProductsData, subscription]);


  const handleChoosePlan = async (priceId: string | null) => {
    if (!priceId) {
        toast({ title: "Error", description: "This plan option is not available right now.", variant: "destructive" });
        return;
    }
    if (!isSignedIn || !userId) {
      toast({ title: "Authentication Required", description: "Please sign in to choose a plan.", variant: "destructive" });
      navigate("/login?mode=sign-in");
      return;
    }

    setLoadingPriceId(priceId);
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const checkoutUrl = `${supabaseUrl}/functions/v1/create-checkout-session`;

      const response = await fetch(checkoutUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priceId, clerkUserId: userId }),
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({error: "Failed to create session and parse error"}));
        throw new Error(errorBody.error || `HTTP error! status: ${response.status}`);
      }
      const { sessionId } = await response.json();
      if (!sessionId) throw new Error("Failed to retrieve session ID.");

      const stripe = await stripePromise;
      if (!stripe) throw new Error("Stripe.js has not loaded yet.");

      const { error: stripeError } = await stripe.redirectToCheckout({ sessionId });
      if (stripeError) {
        console.error("Stripe redirectToCheckout error:", stripeError);
        toast({ title: "Checkout Error", description: stripeError.message || "An unexpected error occurred.", variant: "destructive" });
      }
    } catch (error: any) {
      console.error("Failed to create checkout session:", error);
      toast({ title: "Subscription Error", description: error.message || "Could not initiate the subscription process.", variant: "destructive" });
    } finally {
      setLoadingPriceId(null);
    }
  };

  if (isLoadingProducts) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
        <p className="text-lg text-muted-foreground">Loading pricing plans...</p>
      </div>
    );
  }

  if (productsError) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center text-center px-4">
        <AlertCircle className="h-12 w-12 text-destructive mb-4" />
        <h2 className="text-2xl font-semibold text-destructive mb-2">Error Loading Plans</h2>
        <p className="text-muted-foreground mb-4">
          We couldn't load the pricing plans at this moment. Please try again later.
        </p>
        <p className="text-sm text-muted-foreground">Details: {productsError.message}</p>
        <Button onClick={() => window.location.reload()} className="mt-6">Retry</Button>
      </div>
    );
  }

  if (!displayTiers || displayTiers.length === 0) {
    return (
       <div className="flex min-h-screen flex-col items-center justify-center text-center px-4">
        <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
        <h2 className="text-2xl font-semibold mb-2">No Plans Available</h2>
        <p className="text-muted-foreground">
          There are currently no pricing plans available. Please check back later.
        </p>
      </div>
    );
  }


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

        <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3"> {/* Adjusted grid for potentially more/less than 3 plans */}
          {displayTiers.map((tier) => (
            <Card key={tier.id} className="flex flex-col">
              <CardHeader className="text-center">
                <CardTitle className="text-2xl font-semibold">{tier.name}</CardTitle>
                <CardDescription>{tier.promptsDescription}</CardDescription>
              </CardHeader>
              <CardContent className="flex-1">
                <div className="text-center mb-6">
                  <h3 className="text-3xl font-bold">
                    {tier.monthlyPriceDisplay}
                    <span className="text-sm font-normal text-muted-foreground">/month</span>
                  </h3>
                  <p className="text-muted-foreground mt-1">{tier.yearlyPriceDisplay}</p>
                </div>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  {tier.features.map((feature, index) => (
                    <li key={index} className="flex items-center">
                      <svg className="w-4 h-4 mr-2 text-green-500 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"></path>
                      </svg>
                      {feature}
                    </li>
                  ))}
                </ul>
              </CardContent>
              <CardFooter className="flex flex-col space-y-2 sm:flex-row sm:space-y-0 sm:space-x-2 mt-auto pt-6"> {/* Added mt-auto and pt-6 for alignment */}
                <Button
                  className="w-full"
                  onClick={() => handleChoosePlan(tier.monthlyPriceId)}
                  disabled={loadingPriceId === tier.monthlyPriceId || tier.isCurrentMonthlyPlan}
                >
                  {loadingPriceId === tier.monthlyPriceId ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  {tier.isCurrentMonthlyPlan ? "Current Plan" : "Choose Monthly"}
                </Button>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => handleChoosePlan(tier.yearlyPriceId)}
                  disabled={loadingPriceId === tier.yearlyPriceId || !tier.yearlyPriceId || tier.isCurrentYearlyPlan}
                >
                  {loadingPriceId === tier.yearlyPriceId ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  {tier.isCurrentYearlyPlan ? "Current Plan" : "Choose Yearly"}
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
