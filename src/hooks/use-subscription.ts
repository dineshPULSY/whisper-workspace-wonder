import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@clerk/clerk-react";

// Define the expected shape of the subscription data returned by the Supabase function
interface UserSubscription {
  stripe_price_id: string;
  status: string;
  stripe_current_period_end: string;
  stripe_customer_id: string;
  stripe_subscription_id: string;
}

// Function to fetch the user's subscription details
const fetchUserSubscription = async (
  clerkUserId: string,
  // getToken: (options?: { template?: string }) => Promise<string | null>
): Promise<UserSubscription | null> => {
  if (!clerkUserId) {
    return null;
  }

  // Construct the full URL to your Supabase function
  // Ensure VITE_SUPABASE_URL is set in your .env file for client-side access
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  if (!supabaseUrl) {
    throw new Error("Supabase URL is not configured. Set VITE_SUPABASE_URL.");
  }

  // const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  // if (!supabaseAnonKey) {
  //   throw new Error("Supabase Anon Key is not configured. Set VITE_SUPABASE_ANON_KEY.");
  // }

  // If your function requires Clerk JWT for RLS through Supabase Auth
  // const clerkToken = await getToken({ template: "supabase" });
  // if (!clerkToken) {
  //   throw new Error("Not authenticated with Clerk for Supabase.");
  // }

  const response = await fetch(`${supabaseUrl}/functions/v1/get-user-subscription`, {
    method: "POST", // Or GET, depending on your function's design
    headers: {
      "Content-Type": "application/json",
      // "apikey": supabaseAnonKey, // Required if not using service_role and RLS is restrictive
      // "Authorization": `Bearer ${clerkToken}`, // Pass Clerk token if function uses it for auth
    },
    body: JSON.stringify({ clerk_user_id: clerkUserId }), // Send clerk_user_id in the body for POST
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || `Failed to fetch subscription: ${response.statusText}`);
  }

  // If the function returns null for no subscription (status 200), response.json() might fail or return null.
  // Handle cases where the response might not be JSON or is empty.
  const contentType = response.headers.get("content-type");
  if (contentType && contentType.includes("application/json")) {
    const data = await response.json();
    return data as UserSubscription | null;
  }
  return null; // Return null if no data or not JSON
};

export const useSubscription = () => {
  const { userId, isSignedIn /* getToken */ } = useAuth(); // getToken can be used for Supabase RLS with Clerk JWT

  const {
    data: subscription,
    isLoading,
    error,
    refetch, // Allow refetching subscription
  } = useQuery<UserSubscription | null, Error>(
    ["userSubscription", userId], // Query key includes userId to refetch if it changes
    // () => fetchUserSubscription(userId!, getToken), // Pass getToken if using Clerk JWT for Supabase Auth
    () => fetchUserSubscription(userId!),
    {
      enabled: !!userId && !!isSignedIn, // Only run the query if the user is signed in and userId is available
      staleTime: 5 * 60 * 1000, // Cache data for 5 minutes
      cacheTime: 10 * 60 * 1000, // Keep data in cache for 10 minutes
      // You might want to add retry logic or onError handlers here
    }
  );

  return {
    subscription,
    isLoading,
    error,
    refetch,
    // Helper booleans based on subscription status
    isActive: subscription?.status === 'active' || subscription?.status === 'trialing',
    isTrialing: subscription?.status === 'trialing',
  };
};
