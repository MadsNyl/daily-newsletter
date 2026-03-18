import { BrowserRouter, Routes, Route, Navigate } from "react-router";
import ErrorBoundary from "./components/ErrorBoundary";
import NewsletterPage from "./pages/NewsletterPage";
import CompanyListPage from "./pages/CompanyListPage";
import CompanyDetailPage from "./pages/CompanyDetailPage";

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<NewsletterPage />} />
          <Route path="/:date" element={<NewsletterPage />} />
          <Route path="/companies" element={<CompanyListPage />} />
          <Route path="/companies/:ticker" element={<CompanyDetailPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
