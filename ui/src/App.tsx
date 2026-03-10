/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter, Routes, Route } from "react-router";
import { AppLayout } from "./components/layout/AppLayout";
import { DashboardShell } from "./components/trading/DashboardShell";
import { Scout } from "./pages/Scout";
import { Import } from "./pages/Import";
import { Portfolio } from "./pages/Portfolio";
import { PriceCheck } from "./pages/PriceCheck";
import { Account } from "./pages/Account";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<DashboardShell />} />
        <Route element={<AppLayout />}>
          <Route path="/scout" element={<Scout />} />
          <Route path="/import" element={<Import />} />
          <Route path="/portfolio" element={<Portfolio />} />
          <Route path="/price-check" element={<PriceCheck />} />
          <Route path="/account" element={<Account />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
