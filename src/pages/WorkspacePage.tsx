
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { useAuth } from "@clerk/clerk-react"; // Changed import
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  FolderPlus,
  MessageSquare,
  Folder,
  MoreVertical,
  Edit,
  Trash2,
  Loader2,
  FileUp,
  FileText,
  File,
  X
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchUserWorkspaces, createWorkspace, deleteWorkspace, uploadWorkspaceFile, fetchWorkspaceFiles, deleteWorkspaceFile } from "@/services/workspace-service";
import { Workspace, WorkspaceFile } from "@/models/workspace";

export default function WorkspacePage() {
  const { isSignedIn, userId, isLoaded: isAuthLoaded } = useAuth(); // Changed usage
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [newWorkspaceName, setNewWorkspaceName] = useState("");
  const [newWorkspaceDescription, setNewWorkspaceDescription] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [isLoading, setIsLoading] = useState(true); // This will be for workspace data loading
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedWorkspace, setSelectedWorkspace] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [fileUploadDialogOpen, setFileUploadDialogOpen] = useState(false);
  const [workspaceFiles, setWorkspaceFiles] = useState<Record<string, WorkspaceFile[]>>({});
  
  useEffect(() => {
    if (!isAuthLoaded) {
      // Still waiting for Clerk to load, do nothing or show a specific loader for auth
      return;
    }

    if (!isSignedIn) {
      navigate("/login?mode=sign-in"); // Redirect to Clerk login
      return;
    }
    
    async function loadWorkspaces() {
      if (!userId) return; // Should be available if isSignedIn is true
      
      try {
        setIsLoading(true); // For workspace data loading
        const userWorkspaces = await fetchUserWorkspaces(userId); // Use userId
        setWorkspaces(userWorkspaces);
        
        const filesMap: Record<string, WorkspaceFile[]> = {};
        for (const workspace of userWorkspaces) {
          const files = await fetchWorkspaceFiles(workspace.id);
          filesMap[workspace.id] = files;
        }
        setWorkspaceFiles(filesMap);
      } catch (error) {
        console.error('Error loading workspaces:', error);
        toast({
          title: "Error",
          description: "Failed to load workspaces",
          variant: "destructive"
        });
      } finally {
        setIsLoading(false); // For workspace data loading
      }
    }
    
    loadWorkspaces();
  }, [isAuthLoaded, isSignedIn, userId, navigate, toast]); // Added isAuthLoaded and userId
  
  const handleCreateWorkspace = async () => {
    if (!userId) return; // Check userId
    
    if (!newWorkspaceName.trim()) {
      toast({
        title: "Missing Information",
        description: "Please provide a name for your workspace.",
        variant: "destructive",
      });
      return;
    }
    
    setIsCreating(true);
    
    try {
      const workspace = await createWorkspace(
        userId, // Use userId
        newWorkspaceName,
        newWorkspaceDescription || undefined
      );
      
      setWorkspaces(prev => [workspace, ...prev]);
      setWorkspaceFiles(prev => ({
        ...prev,
        [workspace.id]: []
      }));
      
      setNewWorkspaceName("");
      setNewWorkspaceDescription("");
      setIsDialogOpen(false);
      
      toast({
        title: "Workspace Created",
        description: `'${workspace.name}' has been successfully created.`,
      });
    } catch (error) {
      console.error('Error creating workspace:', error);
      toast({
        title: "Error",
        description: "Failed to create workspace",
        variant: "destructive"
      });
    } finally {
      setIsCreating(false);
    }
  };
  
  const handleDeleteWorkspace = async (id: string) => {
    try {
      const workspaceToDelete = workspaces.find((w) => w.id === id);
      if (!workspaceToDelete) return;
      
      await deleteWorkspace(id);
      
      setWorkspaces(prev => prev.filter(workspace => workspace.id !== id));
      
      toast({
        title: "Workspace Deleted",
        description: `'${workspaceToDelete.name}' has been removed.`,
      });
    } catch (error) {
      console.error('Error deleting workspace:', error);
      toast({
        title: "Error",
        description: "Failed to delete workspace",
        variant: "destructive"
      });
    }
  };
  
  const handleOpenChat = (workspaceId: string) => {
    // Navigate to the chat page with the workspace ID in the URL
    navigate(`/chat?workspace=${workspaceId}`);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, workspaceId: string) => {
    if (!userId) return; // Check userId
    
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    setIsUploading(true);
    
    try {
      const uploadedFiles: WorkspaceFile[] = [];
      
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        console.log('Uploading file:', file.name, 'to workspace:', workspaceId);
        const uploadedFile = await uploadWorkspaceFile(workspaceId, userId, file); // Use userId
        uploadedFiles.push(uploadedFile);
      }
      
      setWorkspaceFiles(prev => ({
        ...prev,
        [workspaceId]: [...(prev[workspaceId] || []), ...uploadedFiles]
      }));
      
      setFileUploadDialogOpen(false);
      setSelectedWorkspace(null);
      
      toast({
        title: "Files Uploaded",
        description: `${uploadedFiles.length} file(s) have been uploaded successfully.`,
      });
    } catch (error) {
      console.error('Error uploading files:', error);
      toast({
        title: "Error",
        description: `Failed to upload files: ${error instanceof Error ? error.message : 'Unknown error'}`,
        variant: "destructive"
      });
    } finally {
      setIsUploading(false);
    }
  };
  
  const handleDeleteFile = async (workspaceId: string, fileId: string) => {
    try {
      await deleteWorkspaceFile(fileId);
      
      setWorkspaceFiles(prev => ({
        ...prev,
        [workspaceId]: (prev[workspaceId] || []).filter(file => file.id !== fileId)
      }));
      
      toast({
        title: "File Deleted",
        description: "The file has been removed from your workspace.",
      });
    } catch (error) {
      console.error('Error deleting file:', error);
      toast({
        title: "Error",
        description: "Failed to delete file",
        variant: "destructive"
      });
    }
  };
  
  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    else if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    else return (bytes / 1048576).toFixed(1) + ' MB';
  };
  
  const getFileIcon = (fileType: string) => {
    if (fileType.includes('image')) return <File className="h-5 w-5 text-blue-500" />;
    if (fileType.includes('pdf')) return <FileText className="h-5 w-5 text-red-500" />;
    if (fileType.includes('word') || fileType.includes('document')) return <FileText className="h-5 w-5 text-blue-600" />;
    if (fileType.includes('sheet') || fileType.includes('excel')) return <FileText className="h-5 w-5 text-green-600" />;
    return <FileText className="h-5 w-5 text-gray-500" />;
  };
  
  // Handle auth loading state
  if (!isAuthLoaded) {
    return (
      <div className="flex h-screen flex-col items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
        <p className="text-lg text-muted-foreground">Loading authentication...</p>
      </div>
    );
  }

  // If auth is loaded but user is not signed in, useEffect should redirect.
  // This is a fallback or could be shown while redirecting.
  if (!isSignedIn) {
     return (
      <div className="flex h-screen flex-col items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
        <p className="text-lg text-muted-foreground">Redirecting to login...</p>
      </div>
    );
  }
  
  // If signedIn, proceed to render the page content (isLoading now refers to workspace data)
  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      
      <main className="flex-1 container py-10">
        <header className="mb-8 flex flex-col md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Workspaces</h1>
            <p className="text-muted-foreground mt-1">
              Organize and manage your chat conversations and files
            </p>
          </div>
          
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button className="mt-4 md:mt-0" size="sm">
                <FolderPlus className="mr-2 h-4 w-4" />
                New Workspace
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create a New Workspace</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <label htmlFor="name" className="text-sm font-medium">
                    Name
                  </label>
                  <Input
                    id="name"
                    placeholder="Enter workspace name"
                    value={newWorkspaceName}
                    onChange={(e) => setNewWorkspaceName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="description" className="text-sm font-medium">
                    Description (optional)
                  </label>
                  <Input
                    id="description"
                    placeholder="Enter workspace description"
                    value={newWorkspaceDescription}
                    onChange={(e) => setNewWorkspaceDescription(e.target.value)}
                  />
                </div>
              </div>
              <div className="flex justify-end">
                <Button
                  onClick={handleCreateWorkspace}
                  disabled={isCreating || !newWorkspaceName.trim()}
                >
                  {isCreating ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    "Create Workspace"
                  )}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
          
          <Dialog open={fileUploadDialogOpen} onOpenChange={setFileUploadDialogOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Upload Files</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
                  <FileUp className="h-8 w-8 mx-auto mb-4 text-gray-400" />
                  <p className="text-sm text-gray-600 mb-2">
                    Drag and drop files here, or click to browse
                  </p>
                  <Input
                    type="file"
                    multiple
                    className="hidden"
                    id="file-upload"
                    onChange={(e) => selectedWorkspace && handleFileUpload(e, selectedWorkspace)}
                  />
                  <Button 
                    onClick={() => document.getElementById('file-upload')?.click()}
                    variant="outline"
                    disabled={isUploading}
                  >
                    {isUploading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Uploading...
                      </>
                    ) : (
                      "Select Files"
                    )}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </header>
        
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {workspaces.map((workspace) => (
              <Card key={workspace.id}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Folder className="h-5 w-5 text-primary" />
                      <CardTitle>{workspace.name}</CardTitle>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent>
                        <DropdownMenuItem className="flex items-center gap-2">
                          <Edit className="h-4 w-4" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                          className="flex items-center gap-2"
                          onClick={() => {
                            setSelectedWorkspace(workspace.id);
                            setFileUploadDialogOpen(true);
                          }}
                        >
                          <FileUp className="h-4 w-4" />
                          Upload Files
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                          className="flex items-center gap-2 text-destructive"
                          onClick={() => handleDeleteWorkspace(workspace.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <CardDescription>{workspace.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex items-center text-sm text-muted-foreground">
                      <MessageSquare className="mr-1 h-4 w-4" />
                      {workspaceFiles[workspace.id]?.length || 0} file{workspaceFiles[workspace.id]?.length !== 1 && "s"}
                    </div>
                    
                    {workspaceFiles[workspace.id] && workspaceFiles[workspace.id].length > 0 && (
                      <div className="mt-3">
                        <h4 className="text-sm font-medium mb-2">Files ({workspaceFiles[workspace.id].length})</h4>
                        <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                          {workspaceFiles[workspace.id].map((file) => (
                            <div 
                              key={file.id} 
                              className="flex items-center justify-between border p-2 rounded-md text-sm"
                            >
                              <div className="flex items-center space-x-2 overflow-hidden">
                                {getFileIcon(file.type)}
                                <span className="truncate">{file.name}</span>
                                <span className="text-xs text-gray-500">({formatFileSize(file.size)})</span>
                              </div>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={() => handleDeleteFile(workspace.id, file.id)}
                              >
                                <X className="h-3 w-3" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    <div className="text-sm text-muted-foreground">
                      Created on{" "}
                      {workspace.createdAt.toLocaleDateString("en-US", {
                        month: "long",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </div>
                  </div>
                </CardContent>
                <CardFooter className="flex gap-2">
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => handleOpenChat(workspace.id)}
                  >
                    <MessageSquare className="mr-2 h-4 w-4" />
                    Open Chats
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      setSelectedWorkspace(workspace.id);
                      setFileUploadDialogOpen(true);
                    }}
                  >
                    <FileUp className="h-4 w-4" />
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        )}
        
        {!isLoading && workspaces.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="rounded-full bg-primary/10 p-6 mb-4">
              <Folder className="h-12 w-12 text-primary" />
            </div>
            <h2 className="text-xl font-semibold mb-2">No Workspaces Yet</h2>
            <p className="text-muted-foreground max-w-md mb-8">
              Create your first workspace to organize your chat conversations.
            </p>
            <Button onClick={() => setIsDialogOpen(true)}>
              <FolderPlus className="mr-2 h-4 w-4" />
              Create Workspace
            </Button>
          </div>
        )}
      </main>
      
      <Footer />
    </div>
  );
}
