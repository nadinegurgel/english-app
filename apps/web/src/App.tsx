import { Navigate, Route, Routes } from "react-router-dom";
import { BottomNav } from "./components/BottomNav";
import { AddWordsScreen } from "./screens/AddWordsScreen";
import { TodayScreen } from "./screens/TodayScreen";
import { WordsScreen } from "./screens/WordsScreen";

export function App() {
  return (
    <div className="app-shell">
      <main className="app-content">
        <Routes>
          <Route path="/" element={<TodayScreen />} />
          <Route path="/add" element={<AddWordsScreen />} />
          <Route path="/words" element={<WordsScreen />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <BottomNav />
    </div>
  );
}
