'use client'

import { createContext, useContext, useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const AuthContext = createContext<{ token: string | null; setToken: (token: string | null) => void }>({ token: null, setToken: () => {} })
export function useAuth() { return useContext(AuthContext) }
export function Providers({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null)
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 30_000 } } }))
  return <AuthContext.Provider value={{ token, setToken }}><QueryClientProvider client={queryClient}>{children}</QueryClientProvider></AuthContext.Provider>
}
