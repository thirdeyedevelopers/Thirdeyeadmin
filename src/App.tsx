import { Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import Overview from "./pages/Overview";
import LivePage from "./pages/Live";
import Users from "./pages/Users";
import UserDetail from "./pages/UserDetail";
import Features from "./pages/Features";
import Health from "./pages/Health";
import Admins from "./pages/Admins";
import ApiKeys from "./pages/ApiKeys";

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Overview />} />
        <Route path="live" element={<LivePage />} />
        <Route path="users" element={<Users />} />
        <Route path="users/:uid" element={<UserDetail />} />
        <Route path="features" element={<Features />} />
        <Route path="health" element={<Health />} />
        <Route path="api-keys" element={<ApiKeys />} />
        <Route path="admins" element={<Admins />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
