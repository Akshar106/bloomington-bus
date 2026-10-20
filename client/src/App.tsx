import { BrowserRouter, Route, Routes } from "react-router";
import { Layout } from "./components/Layout.tsx";
import { AboutPage } from "./pages/AboutPage.tsx";
import { HomePage } from "./pages/HomePage.tsx";
import { NotFoundPage } from "./pages/NotFoundPage.tsx";
import { RoutePage } from "./pages/RoutePage.tsx";
import { RoutesPage } from "./pages/RoutesPage.tsx";
import { StopPage } from "./pages/StopPage.tsx";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<HomePage />} />
          <Route path="stop/:stopId" element={<StopPage />} />
          <Route path="routes" element={<RoutesPage />} />
          <Route path="route/:routeId" element={<RoutePage />} />
          <Route path="about" element={<AboutPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
