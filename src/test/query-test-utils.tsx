import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { FrameworkProvider } from "@/lib/framework-context";

export function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <FrameworkProvider>{children}</FrameworkProvider>
      </QueryClientProvider>
    );
  };
}
