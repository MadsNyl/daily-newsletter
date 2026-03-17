import { BrowserRouter, Routes, Route, Navigate } from "react-router";
import NewsletterPage from "./pages/NewsletterPage";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<NewsletterPage />} />
        <Route path="/:date" element={<NewsletterPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
