import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { BottomNav } from "./components/BottomNav";
import { AddWordsScreen } from "./screens/AddWordsScreen";
import { QuizScreen } from "./screens/QuizScreen";
import { SettingsScreen } from "./screens/SettingsScreen";
import { TodayScreen } from "./screens/TodayScreen";
import { WordsScreen } from "./screens/WordsScreen";

export function App() {
  const { pathname } = useLocation();
  // The quiz takes the whole screen, without the navigation bar.
  const inQuiz = pathname === "/quiz" || pathname.startsWith("/practice/");

  return (
    <div className="app-shell">
      <main className={inQuiz ? "app-content no-nav" : "app-content"}>
        <Routes>
          <Route path="/" element={<TodayScreen />} />
          <Route path="/add" element={<AddWordsScreen />} />
          <Route path="/words" element={<WordsScreen />} />
          <Route path="/settings" element={<SettingsScreen />} />
          <Route path="/quiz" element={<QuizScreen key="daily" kind="daily" />} />
          <Route path="/practice/:setId" element={<QuizScreen key="practice" kind="practice" />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      {!inQuiz && <BottomNav />}
    </div>
  );
}
