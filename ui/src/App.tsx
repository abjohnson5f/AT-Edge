/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter, Routes, Route } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppLayout } from "./components/layout/AppLayout";
import { Dashboard } from "./pages/Dashboard";
import { Scout } from "./pages/Scout";
import { Import } from "./pages/Import";
import { Portfolio } from "./pages/Portfolio";
import { PriceCheck } from "./pages/PriceCheck";
import { Account } from "./pages/Account";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      refetchOnWindowFocus: false,
    },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/scout" element={<Scout />} />
            <Route path="/import" element={<Import />} />
            <Route path="/portfolio" element={<Portfolio />} />
            <Route path="/price-check" element={<PriceCheck />} />
            <Route path="/account" element={<Account />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
