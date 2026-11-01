import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/layout";
import { OverviewPage } from "./pages/overview";
import { SearchPage } from "./pages/search";
import { TorrentPage } from "./pages/torrent";
import { FollowsPage } from "./pages/follows";
import { DownloadsPage } from "./pages/downloads";
import { SettingsPage } from "./pages/settings";

export function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<OverviewPage />} />
        <Route path="search" element={<SearchPage />} />
        <Route path="torrents/:providerId/:torrentId" element={<TorrentPage />} />
        <Route path="follows" element={<FollowsPage />} />
        <Route path="downloads" element={<DownloadsPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
