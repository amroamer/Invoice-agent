import { createBrowserRouter, Navigate } from "react-router-dom";

import { Layout } from "@/components/Layout";
import { Protected } from "@/components/Protected";
import { AuditPage } from "@/pages/AuditPage";
import { ContractDetailPage } from "@/pages/ContractDetailPage";
import { ContractsPage } from "@/pages/ContractsPage";
import { DashboardPage } from "@/pages/DashboardPage";
import { HistoricalInvoicesPage } from "@/pages/HistoricalInvoicesPage";
import { InvoicesPage } from "@/pages/InvoicesPage";
import { LoginPage } from "@/pages/LoginPage";
import { ProjectsPage } from "@/pages/ProjectsPage";
import { ReviewDecidePage } from "@/pages/ReviewDecidePage";
import { SettingsPage } from "@/pages/SettingsPage";
import { SystemHealthPage } from "@/pages/SystemHealthPage";
import { UsersPage } from "@/pages/UsersPage";
import { VendorsPage } from "@/pages/VendorsPage";

export const router = createBrowserRouter([
  { path: "/login", element: <LoginPage /> },
  {
    path: "/",
    element: (
      <Protected>
        <Layout />
      </Protected>
    ),
    children: [
      { index: true, element: <DashboardPage /> },
      { path: "invoices", element: <InvoicesPage /> },
      { path: "invoices/:invoiceId", element: <ReviewDecidePage /> },
      // Keep legacy deep-links alive for a release by aliasing them to the new page.
      { path: "invoices/:invoiceId/review", element: <ReviewDecidePage /> },
      { path: "invoices/:invoiceId/match", element: <ReviewDecidePage /> },
      { path: "invoices/:invoiceId/boq-map", element: <ReviewDecidePage /> },
      { path: "invoices/:invoiceId/recommendation", element: <ReviewDecidePage /> },
      { path: "invoices/:invoiceId/pay", element: <ReviewDecidePage /> },
      { path: "projects", element: <ProjectsPage /> },
      { path: "vendors", element: <VendorsPage /> },
      { path: "contracts", element: <ContractsPage /> },
      { path: "contracts/:contractId", element: <ContractDetailPage /> },
      { path: "historical-invoices", element: <HistoricalInvoicesPage /> },
      {
        path: "users",
        element: (
          <Protected roles={["admin"]}>
            <UsersPage />
          </Protected>
        ),
      },
      {
        path: "audit",
        element: (
          <Protected roles={["admin"]}>
            <AuditPage />
          </Protected>
        ),
      },
      {
        path: "system-health",
        element: (
          <Protected roles={["admin"]}>
            <SystemHealthPage />
          </Protected>
        ),
      },
      { path: "settings", element: <SettingsPage /> },
    ],
  },
  { path: "*", element: <Navigate to="/" replace /> },
], {
  basename: "/InvoiceAgent",
  future: {
    v7_relativeSplatPath: true,
  },
});
