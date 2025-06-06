
import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from "@clerk/clerk-react"; // Changed import

export type ChatLayoutStyle = 'standard' | 'compact' | 'bubble';

interface SettingsContextType {
  chatStyle: ChatLayoutStyle;
  botImageUrl: string | null;
  setChatStyle: (style: ChatLayoutStyle) => void;
  setBotImageUrl: (url: string | null) => void;
  isLoading: boolean;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [chatStyle, setChatStyle] = useState<ChatLayoutStyle>('standard');
  const [botImageUrl, setBotImageUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false); // For settings data loading
  const { userId, isSignedIn, isLoaded: isAuthLoaded } = useAuth(); // Changed usage

  // Load settings from local storage or database
  useEffect(() => {
    // Only attempt to load from DB if auth is loaded and user is signed in
    if (isAuthLoaded && isSignedIn && userId) {
      setIsLoading(true);
      
      // First try to load from localStorage for immediate feedback (can be done regardless of auth state)
      // However, DB fetch should only happen for authenticated user.
      // For consistency, we can keep localStorage loading here or move it outside if it should always apply.
      // Let's assume settings are user-specific, so localStorage loading is also tied to user session.
      const savedChatStyle = localStorage.getItem('chatStyle');
      const savedBotImage = localStorage.getItem('botImageUrl');
      
      if (savedChatStyle) {
        setChatStyle(savedChatStyle as ChatLayoutStyle);
      }
      
      if (savedBotImage) {
        setBotImageUrl(savedBotImage);
      }
      
      // Then try to load from database
      const fetchSettings = async () => {
        try {
          const { data, error } = await supabase
            .from('user_settings')
            .select('chat_style, bot_image_url')
            .eq('user_id', userId) // Use userId
            .single();
            
          if (!error && data) {
            if (data.chat_style) {
              setChatStyle(data.chat_style as ChatLayoutStyle);
              localStorage.setItem('chatStyle', data.chat_style);
            }
            
            if (data.bot_image_url) {
              setBotImageUrl(data.bot_image_url);
              localStorage.setItem('botImageUrl', data.bot_image_url);
            }
          }
        } catch (err) {
          console.error('Error loading settings:', err);
        } finally {
          setIsLoading(false);
        }
      };
      
      fetchSettings();
    } else if (isAuthLoaded && !isSignedIn) {
      // User is not signed in, clear any user-specific settings if necessary
      // or load default settings. For now, we just ensure isLoading is false.
      setIsLoading(false);
      // Optionally clear localStorage if settings are strictly per-user and should not persist across logins
      // localStorage.removeItem('chatStyle');
      // localStorage.removeItem('botImageUrl');
      // setChatStyle('standard'); // Reset to default
      // setBotImageUrl(null);
    }
  }, [userId, isSignedIn, isAuthLoaded]); // Updated dependencies

  // Save settings whenever they change
  const saveSettings = async (style: ChatLayoutStyle, imageUrl: string | null) => {
    // Save to localStorage for immediate feedback (can be done regardless of auth state)
    localStorage.setItem('chatStyle', style);
    if (imageUrl) localStorage.setItem('botImageUrl', imageUrl);
    else localStorage.removeItem('botImageUrl');
    
    // Save to database only if user is signed in and userId is available
    if (isSignedIn && userId) {
      try {
        const { error } = await supabase
          .from('user_settings')
          .upsert({
            user_id: userId, // Use userId
            chat_style: style,
            bot_image_url: imageUrl,
            updated_at: new Date()
          }, { onConflict: 'user_id' });
          
        if (error) console.error('Error saving settings to DB:', error);
      } catch (err) {
        console.error('Error in saveSettings DB operation:', err);
      }
    }
  };

  const handleSetChatStyle = (style: ChatLayoutStyle) => {
    setChatStyle(style);
    saveSettings(style, botImageUrl);
  };
  
  const handleSetBotImageUrl = (url: string | null) => {
    setBotImageUrl(url);
    saveSettings(chatStyle, url);
  };

  return (
    <SettingsContext.Provider 
      value={{ 
        chatStyle,
        botImageUrl,
        setChatStyle: handleSetChatStyle,
        setBotImageUrl: handleSetBotImageUrl,
        isLoading
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (context === undefined) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
}
