'use client';
import { createContext, useContext, useState } from 'react';

type SidebarCtx = { isOpen: boolean; open: () => void; close: () => void };
const SidebarContext = createContext<SidebarCtx>({ isOpen: false, open: () => {}, close: () => {} });

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <SidebarContext.Provider value={{ isOpen, open: () => setIsOpen(true), close: () => setIsOpen(false) }}>
      {children}
    </SidebarContext.Provider>
  );
}

export const useSidebar = () => useContext(SidebarContext);
