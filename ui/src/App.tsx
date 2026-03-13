/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter, Routes, Route } from "react-router";
import { DashboardShell } from "./components/trading/DashboardShell";
import { Scout } from "./pages/Scout";
import { Import } from "./pages/Import";
import { Portfolio } from "./pages/Portfolio";
import { PriceCheck } from "./pages/PriceCheck";
import { Account } from "./pages/Account";
import { Toaster } from "./components/ui/toaster";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<DashboardShell />}>
          <Route path="/" element={null} />
          <Route path="/scout" element={<Scout />} />
          <Route path="/import" element={<Import />} />
          <Route path="/portfolio" element={<Portfolio />} />
          <Route path="/price-check" element={<PriceCheck />} />
          <Route path="/account" element={<Account />} />
        </Route>
      </Routes>
      <Toaster />
    </BrowserRouter>
  );
}
