CREATE TABLE public.user_subscriptions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    clerk_user_id TEXT NOT NULL,
    stripe_customer_id TEXT NOT NULL UNIQUE,
    stripe_subscription_id TEXT NOT NULL UNIQUE,
    stripe_price_id TEXT NOT NULL,
    stripe_current_period_end TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL, -- e.g., 'active', 'canceled', 'past_due', etc.
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Add indexes for frequently queried columns
CREATE INDEX idx_user_subscriptions_clerk_user_id ON public.user_subscriptions(clerk_user_id);
CREATE INDEX idx_user_subscriptions_stripe_subscription_id ON public.user_subscriptions(stripe_subscription_id);

-- Optional: Add a trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION trigger_set_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_user_subscriptions_updated_at
BEFORE UPDATE ON public.user_subscriptions
FOR EACH ROW
EXECUTE FUNCTION trigger_set_timestamp();

COMMENT ON TABLE public.user_subscriptions IS 'Stores user subscription data linked to Stripe.';
COMMENT ON COLUMN public.user_subscriptions.clerk_user_id IS 'User ID from Clerk authentication.';
COMMENT ON COLUMN public.user_subscriptions.stripe_customer_id IS 'Stripe Customer ID.';
COMMENT ON COLUMN public.user_subscriptions.stripe_subscription_id IS 'Stripe Subscription ID.';
COMMENT ON COLUMN public.user_subscriptions.stripe_price_id IS 'Stripe Price ID (or Plan ID) for the subscription.';
COMMENT ON COLUMN public.user_subscriptions.stripe_current_period_end IS 'Timestamp when the current subscription period ends.';
COMMENT ON COLUMN public.user_subscriptions.status IS 'Current status of the subscription (e.g., active, trialing, past_due, canceled).';
