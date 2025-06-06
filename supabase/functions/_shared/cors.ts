// Allow requests from specific origins.
// For local development, this might be 'http://localhost:5173'.
// For production, this should be your frontend application's domain.
const allowedOrigins = [
  "http://localhost:5173",
  "https://your-production-domain.com", // Replace with your actual production domain
];

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*", // More restrictive in production: check origin and set it dynamically
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS", // Specify allowed methods
};

// Function to handle CORS preflight requests and add headers to responses.
// This can be more sophisticated, checking req.headers.get("Origin") against allowedOrigins.
// For now, we'll keep it simple in the main function and use '*' for Allow-Origin,
// but it's good practice to refine this for production.
export function handleCors(req: Request): Response | null {
  const origin = req.headers.get("Origin");

  // Basic check, can be expanded
  // if (origin && !allowedOrigins.includes(origin)) {
  //   return new Response("Forbidden", { status: 403 });
  // }

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // For actual requests, headers will be added by the calling function
  return null;
}
