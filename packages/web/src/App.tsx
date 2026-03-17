import { BrowserRouter, Routes, Route, Navigate } from "react-router";
import ErrorBoundary from "./components/ErrorBoundary";
import NewsletterPage from "./pages/NewsletterPage";

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<NewsletterPage />} />
          <Route path="/:date" element={<NewsletterPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
