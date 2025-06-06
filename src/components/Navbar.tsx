
import { useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useAuth, UserButton } from "@clerk/clerk-react"; // Updated useAuth
import { useSubscription } from "@/hooks/use-subscription"; // New subscription hook
import { Menu, X, Bell, Check, X as XIcon, Loader2, ExternalLink, Crown } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// Helper to map price IDs to plan names
const planNameMapping: { [key: string]: string } = {
  "price_1PTDOEBW9IshQPOYIY96dpIY": "Starter Monthly",
  "price_1PuUW9BW9IshQPOYxjEGWGdx": "Starter Yearly",
  "price_1PRPTDBW9IshQPOY344HAEeB": "Basic Monthly",
  "price_1PuUXgBW9IshQPOYqPLPbsvn": "Basic Yearly",
  "price_1PRPUnBW9IshQPOY8lWSpbpb": "Pro Monthly",
  "price_1PXbcfBW9IshQPOYIVhgP6lD": "Pro Yearly",
};

const getPlanDisplayName = (priceId: string | undefined) => {
  if (!priceId) return "Unknown Plan";
  return planNameMapping[priceId] || priceId; // Fallback to priceId if not mapped
};

export function Navbar() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [invites, setInvites] = useState<any[]>([]); // Explicitly type invites
  const [showNotifications, setShowNotifications] = useState(false); // Keep this for dialog, separate from dropdown
  const { isSignedIn, userId, signOut } = useAuth(); // Clerk's useAuth
  const { subscription, isLoading: isSubscriptionLoading, isActive: isSubscriptionActive } = useSubscription();
  const location = useLocation();
  const navigate = useNavigate();


  const isHomePage = location.pathname === "/";

  useEffect(() => {
    if (userId) { // Use userId from Clerk
      supabase
        .from("workspace_invites")
        .select("id, workspace_id, workspace_name")
        .eq("invitee_id", userId) // Use Clerk's userId
        .eq("status", "pending")
        .then(({ data, error }) => {
          if (error) {
            console.error("Error fetching invites:", error);
            setInvites([]);
          } else {
            setInvites(data || []);
          }
        });
    } else {
      setInvites([]); // Clear invites if no user
    }
  }, [userId]); // Depend on Clerk's userId

  const handleInviteAction = async (inviteId: string, accept: boolean) => {
    // Accept or reject invite
    await supabase
      .from("workspace_invites")
      .update({ status: accept ? "accepted" : "rejected" })
      .eq("id", inviteId);
    setInvites(invites => invites.filter(inv => inv.id !== inviteId));
    if (accept) {
      // Add workspace access - assume backend handles this with a trigger or policy
    }
  };

  const NavLink = ({ to, label }: { to: string; label: string }) => (
    <Link 
      to={to} 
      className="text-gray-700 hover:text-secondary transition-colors dark:text-gray-200"
      onClick={() => setIsMenuOpen(false)}
    >
      {label}
    </Link>
  );

  return (
    <header className="sticky top-0 z-50 w-full bg-secondary/10 backdrop-blur-md supports-[backdrop-filter]:bg-secondary/5 border-b border-border/40 shadow-sm">
      <div className="container flex h-16 items-center justify-between">
        <Link to="/" className="flex items-center gap-2">
          <img src="/katagrafy_logo_mark.png" className="h-8 w-auto" />
          <span className="font-bold text-xl bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent hidden sm:inline-block">Katagrafy.ai</span>
        </Link>
        
        {/* Desktop Navigation */}
        <nav className="hidden md:flex md:flex-1 md:justify-center">
          <div className="flex gap-6 font-medium">
            {isHomePage && (
              <>
                <NavLink to="/#features" label="Features" />
                <NavLink to="/#pricing" label="Pricing" />
              </>
            )}
            <NavLink to="/faq" label="FAQ" />
          </div>
        </nav>
        
        <div className="flex items-center gap-3">
          <ThemeToggle />

          {isSignedIn && ( // Use isSignedIn from Clerk
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant={invites.length > 0 ? "secondary" : "ghost"} // Keep notification logic
                  size="icon"
                  className="relative"
                >
                  <Bell className="h-5 w-5" />
                  {invites.length > 0 && (
                    <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-[260px]">
                <div className="py-2 px-3 font-medium text-sm">Notifications</div>
                {invites.length === 0 ? (
                  <div className="px-3 py-2 text-muted-foreground text-sm">
                    No new invitations.
                  </div>
                ) : (
                  invites.map((invite: any) => (
                    <div key={invite.id} className="px-3 py-2 border-t border-border">
                      <div className="font-medium text-sm">{invite.workspace_name}</div>
                      <div className="text-xs text-muted-foreground mb-2">You have been invited.</div>
                      <div className="flex gap-2 mt-1">
                        <Button size="sm" variant="outline" className="h-8 px-2 py-1 text-xs" onClick={() => handleInviteAction(invite.id, true)}>
                          <Check className="h-3 w-3 mr-1" /> Accept
                        </Button>
                        <Button size="sm" variant="ghost" className="h-8 px-2 py-1 text-xs" onClick={() => handleInviteAction(invite.id, false)}>
                          <XIcon className="h-3 w-3 mr-1" /> Decline
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {!isSignedIn ? ( // Use isSignedIn from Clerk
            <div className="hidden md:flex md:items-center md:gap-2">
              <Link to="/login?mode=sign-in">
                <Button variant="outline" size="sm" className="font-medium">Login</Button>
              </Link>
              <Link to="/login?mode=sign-up">
                <Button size="sm" className="font-medium">Sign Up</Button>
              </Link>
            </div>
          ) : (
            <div className="hidden md:flex md:items-center md:gap-3">
              {isSubscriptionLoading ? (
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              ) : isSubscriptionActive && subscription ? (
                <Link to="/pricing" className="flex items-center text-sm font-medium text-primary hover:underline">
                  <Crown className="h-4 w-4 mr-1 text-yellow-500" /> {getPlanDisplayName(subscription.stripe_price_id)}
                </Link>
              ) : (
                <Link to="/pricing">
                  <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive-foreground">
                    Subscribe
                  </Button>
                </Link>
              )}
              <Link to="/chat">
                <Button variant="outline" size="sm">Chat</Button>
              </Link>
              {/* Use Clerk's UserButton for profile management and logout */}
              <UserButton afterSignOutUrl="/" />
            </div>
          )}
          
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            aria-label="Toggle menu"
          >
            {isMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>
      </div>
      
      {/* Mobile Navigation Dropdown */}
      {isMenuOpen && (
        <div className="md:hidden border-t border-border/40 bg-secondary/5 backdrop-blur-md animate-fade-in">
          <div className="container py-4 flex flex-col gap-4">
            {isHomePage && (
              <>
                <NavLink to="/#features" label="Features" />
                {/* Link to /pricing directly instead of /#pricing */}
                <NavLink to="/pricing" label="Pricing" />
              </>
            )}
            <NavLink to="/faq" label="FAQ" />
            
            <div className="h-px bg-border/60 my-1"></div>
            
            {!isSignedIn ? ( // Use isSignedIn from Clerk
              <div className="flex flex-col gap-2 mt-2">
                <Link to="/login?mode=sign-in" onClick={() => setIsMenuOpen(false)}>
                  <Button variant="outline" className="w-full">Login</Button>
                </Link>
                <Link to="/login?mode=sign-up" onClick={() => setIsMenuOpen(false)}>
                  <Button className="w-full">Sign Up</Button>
                </Link>
              </div>
            ) : (
              <div className="flex flex-col gap-2 mt-2">
                 {isSubscriptionLoading ? (
                  <div className="flex items-center justify-center py-2">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : isSubscriptionActive && subscription ? (
                  <Link to="/pricing" className="text-sm font-medium text-primary p-2 text-center rounded-md hover:bg-accent" onClick={() => setIsMenuOpen(false)}>
                     <Crown className="h-4 w-4 mr-1 inline text-yellow-500" /> {getPlanDisplayName(subscription.stripe_price_id)}
                  </Link>
                ) : (
                  <Link to="/pricing" onClick={() => setIsMenuOpen(false)}>
                    <Button variant="ghost" className="w-full text-destructive hover:text-destructive-foreground">
                      Subscribe
                    </Button>
                  </Link>
                )}
                <Link to="/chat" onClick={() => setIsMenuOpen(false)}>
                  <Button variant="outline" className="w-full">Chat</Button>
                </Link>
                <Link to="/workspace" onClick={() => setIsMenuOpen(false)}>
                  <Button variant="outline" className="w-full">Workspace</Button>
                </Link>
                <Button 
                  variant="ghost" 
                  className="w-full" 
                  onClick={async () => {
                    await signOut(() => navigate("/")); // Use Clerk's signOut and navigate
                    setIsMenuOpen(false);
                  }}
                >
                  Logout
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
      
      {/* Invite notification dialog - keeping the previous implementation as fallback */}
      <Dialog open={showNotifications} onOpenChange={setShowNotifications}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invitations</DialogTitle>
          </DialogHeader>
          <div className="py-3">
            {invites.length === 0 && (
              <p className="text-muted-foreground text-sm">No new invitations.</p>
            )}
            {invites.map((invite: any) => (
              <div key={invite.id} className="flex justify-between items-center mb-2 border p-2 rounded">
                <div>
                  <div className="font-semibold">{invite.workspace_name}</div>
                  <div className="text-xs text-muted-foreground">You have been invited.</div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="ghost" onClick={() => handleInviteAction(invite.id, true)}>
                    <Check className="h-4 w-4" /> Accept
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => handleInviteAction(invite.id, false)}>
                    <XIcon className="h-4 w-4" /> Reject
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </header>
  );
}
