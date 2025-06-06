// supabase/functions/_shared/cors.ts

const allowedOrigins = [
  "http://localhost:5173", // Default Vite port for dev
  "http://localhost:8080", // User's specified local dev port
  "https_your_production_domain.com" // REPLACE with your actual production domain
  // Add other allowed origins here, e.g., preview deployment URLs
];

export function getCorsHeaders(requestOrigin: string | null): Record<string, string> {
  let originHeader = "*"; // Default to wildcard for general cases or direct calls (non-browser)

  // If the request is from a browser and its origin is in our allowed list, reflect it.
  // This is crucial for credentials and other restricted CORS requests.
  if (requestOrigin && allowedOrigins.includes(requestOrigin)) {
    originHeader = requestOrigin;
  } else if (requestOrigin) {
    // If origin is present but not in allowed list, you might choose to not set
    // Access-Control-Allow-Origin, or stick to '*' if your function is public.
    // For now, if it's a browser request not explicitly allowed, it will fall back to '*'
    // which might be too permissive for some needs.
    // A stricter approach for non-allowed origins could be to return no CORS headers
    // or a specific error, but that depends on security requirements.
    // For now, we allow '*' which is fine for public, non-credentialed requests.
    // If credentials ARE EVER NEEDED (e.g. cookies), '*' is NOT appropriate and origin must be specific.
    console.warn(`CORS: Request origin "${requestOrigin}" is not in allowedOrigins. Defaulting to '*' or specific if matched.`);
  }


  return {
    "Access-Control-Allow-Origin": originHeader,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, accept", // Added 'accept'
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS", // Common methods, can be expanded
  };
}

// The old static corsHeaders and handleCors function should be removed by this overwrite.
// If they were in a different structure, ensure they are cleaned up.
// This file now only exports getCorsHeaders.
