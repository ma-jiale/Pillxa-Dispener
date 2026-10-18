import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from './App.tsx';
import './styles.css';
const client = new QueryClient({
  defaultOptions: { queries: { staleTime: 1500, retry: false, refetchOnWindowFocus: true } },
});
createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={client}>
    <App />
  </QueryClientProvider>,
);
