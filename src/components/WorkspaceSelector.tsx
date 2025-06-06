import { useState, useEffect, useMemo, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Check, ChevronsUpDown, Plus, FolderPlus, Loader2 } from "lucide-react"; // Added Loader2
import { useAuth } from "@clerk/clerk-react"; // Changed import
import { fetchUserWorkspaces, createWorkspace } from "@/services/workspace-service";
import { Workspace } from "@/models/workspace";
import { useToast } from "@/hooks/use-toast";

interface WorkspaceSelectorProps {
  onSelect: (workspaceId: string) => void;
  initialWorkspaceId?: string;
}

export function WorkspaceSelector({ onSelect, initialWorkspaceId }: WorkspaceSelectorProps) {
  const { userId, isSignedIn, isLoaded: isAuthLoaded } = useAuth(); // Changed usage
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [selectedWorkspace, setSelectedWorkspace] = useState<Workspace | null>(null);
  const [newWorkspaceName, setNewWorkspaceName] = useState("");
  const [isCreatingWorkspace, setIsCreatingWorkspace] = useState(false);
  const [isLoading, setIsLoading] = useState(true); // For workspace data loading
  const [loadError, setLoadError] = useState<string | null>(null);
  const [lastFetchedUserId, setLastFetchedUserId] = useState<string | null>(null); // To prevent re-fetching for same user
  
  useEffect(() => {
    async function loadWorkspaces() {
      // Wait for auth to load and user to be signed in
      if (!isAuthLoaded || !isSignedIn || !userId) {
        setIsLoading(false); // Not loading workspaces if no user
        setWorkspaces([]); // Clear workspaces if user logs out
        setLastFetchedUserId(null);
        return;
      }

      // Avoid re-fetching if userId hasn't changed since last successful fetch
      if (userId === lastFetchedUserId) {
        setIsLoading(false); // Already loaded for this user
        return;
      }
      
      try {
        setIsLoading(true);
        setLoadError(null);
        
        console.log('Fetching workspaces for user:', userId);
        const userWorkspaces = await fetchUserWorkspaces(userId);
        console.log('Fetched workspaces:', userWorkspaces);
        
        setWorkspaces(userWorkspaces);
        setLastFetchedUserId(userId); // Store the userId for which data was fetched
        
        // Select the first workspace by default or the one specified by initialWorkspaceId
        if (userWorkspaces.length > 0) {
          let workspaceToSelect = userWorkspaces[0];
          
          // If initialWorkspaceId is provided, try to find that workspace
          if (initialWorkspaceId) {
            const initialWorkspace = userWorkspaces.find(w => w.id === initialWorkspaceId);
            if (initialWorkspace) {
              workspaceToSelect = initialWorkspace;
            }
          }
          
          setSelectedWorkspace(workspaceToSelect);
          onSelect(workspaceToSelect.id);
        } else {
          // If user has no workspaces, ensure selectedWorkspace is null and onSelect might not be called
          // or called with a specific value indicating no workspace.
          setSelectedWorkspace(null);
          // onSelect(""); // Or handle as per application logic for no workspace
        }
      } catch (err) {
        console.error('Error loading workspaces:', err);
        setWorkspaces([]);
        setLoadError("Failed to load workspaces. Please try again.");
      } finally {
        setIsLoading(false);
      }
    }
    
    loadWorkspaces();
  }, [isAuthLoaded, isSignedIn, userId, onSelect, initialWorkspaceId, lastFetchedUserId]);
  
  // Memoize handlers to prevent unnecessary re-renders
  const handleSelect = useCallback((workspace: Workspace) => {
    setSelectedWorkspace(workspace);
    onSelect(workspace.id);
    setOpen(false);
  }, [onSelect]);
  
  const handleCreateWorkspace = useCallback(async () => {
    if (!isSignedIn || !userId) { // Check isSignedIn and userId
      toast({
        title: "Authentication Error",
        description: "You must be logged in to create a workspace.",
        variant: "destructive"
      });
      return;
    }
    
    if (isCreatingWorkspace) {
      if (!newWorkspaceName.trim()) {
        toast({
          title: "Error",
          description: "Workspace name cannot be empty.",
          variant: "destructive"
        });
        return;
      }
      
      try {
        console.log('Creating new workspace:', newWorkspaceName);
        const newWorkspace = await createWorkspace(userId, newWorkspaceName); // Use userId
        console.log('Workspace created:', newWorkspace);
        
        // Add the new workspace to the local state
        setWorkspaces(prev => [...prev, newWorkspace]);
        
        // Select the newly created workspace
        setSelectedWorkspace(newWorkspace);
        onSelect(newWorkspace.id);
        
        // Reset the input field
        setNewWorkspaceName("");
        
        toast({
          title: "Workspace Created",
          description: `Workspace "${newWorkspace.name}" created successfully.`
        });
        
        // Exit creation mode
        setIsCreatingWorkspace(false);
      } catch (error) {
        console.error('Error creating workspace:', error);
        toast({
          title: "Error",
          description: "Failed to create workspace. Please try again.",
          variant: "destructive"
        });
      }
    } else {
      // Enter workspace creation mode
      setIsCreatingWorkspace(true);
    }
  }, [isCreatingWorkspace, newWorkspaceName, onSelect, toast, isSignedIn, userId]); // Added isSignedIn, userId

  // Memoize the button text to prevent unnecessary re-renders
  const buttonText = useMemo(() => {
    if (!isAuthLoaded || isLoading) return "Loading..."; // Combined loading state for auth and data
    if (!isSignedIn) return "Login to see workspaces";
    if (selectedWorkspace) return selectedWorkspace.name;
    if (workspaces.length === 0 && !loadError) return "No workspaces yet";
    if (loadError) return "Error loading";
    return "Select workspace";
  }, [isAuthLoaded, isLoading, isSignedIn, selectedWorkspace, workspaces.length, loadError]);
  
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between"
          disabled={!isAuthLoaded || isLoading || !isSignedIn} // Disable if auth not loaded, data loading, or not signed in
        >
          {isLoading && isAuthLoaded && isSignedIn ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          {buttonText}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[200px] p-0">
        <Command>
          <CommandInput placeholder="Search workspace..." />
          <CommandList>
            {loadError && (
              <div className="px-2 py-3 text-sm text-red-500">
                {loadError}
              </div>
            )}
            <CommandEmpty>No workspace found.</CommandEmpty>
            <CommandGroup heading="Workspaces">
              {workspaces.map((workspace) => (
                <CommandItem
                  key={workspace.id}
                  value={workspace.name}
                  onSelect={() => handleSelect(workspace)}
                >
                  <Check
                    className={`mr-2 h-4 w-4 ${
                      selectedWorkspace?.id === workspace.id
                        ? "opacity-100"
                        : "opacity-0"
                    }`}
                  />
                  {workspace.name}
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
            {isCreatingWorkspace ? (
              <div className="flex items-center p-2">
                <input
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  placeholder="New workspace name"
                  value={newWorkspaceName}
                  onChange={(e) => setNewWorkspaceName(e.target.value)}
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      handleCreateWorkspace();
                    }
                  }}
                />
                <Button
                  size="sm"
                  className="ml-2"
                  onClick={handleCreateWorkspace}
                  disabled={!newWorkspaceName.trim()}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <CommandItem
                onSelect={handleCreateWorkspace}
                className="cursor-pointer"
              >
                <FolderPlus className="mr-2 h-4 w-4" />
                Create Workspace
              </CommandItem>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
