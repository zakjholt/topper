import type { ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { useSession } from "./auth.ts";
import { HomePage } from "./pages/Home.tsx";
import { LoginPage } from "./pages/Login.tsx";
import { SignupPage } from "./pages/Signup.tsx";
import { TablePage } from "./pages/Table.tsx";

function Guard({ children }: { children: ReactNode }) {
  const { data, isPending } = useSession();
  if (isPending) return <div className="auth-page">Lighting the lanterns…</div>;
  if (!data?.user) return <Navigate to="/login" replace />;
  return children;
}

function Guest({ children }: { children: ReactNode }) {
  const { data, isPending } = useSession();
  if (isPending) return <div className="auth-page">Lighting the lanterns…</div>;
  if (data?.user) return <Navigate to="/" replace />;
  return children;
}

export function App() {
  return (
    <Routes>
      <Route
        path="/login"
        element={
          <Guest>
            <LoginPage />
          </Guest>
        }
      />
      <Route
        path="/signup"
        element={
          <Guest>
            <SignupPage />
          </Guest>
        }
      />
      <Route
        path="/"
        element={
          <Guard>
            <HomePage />
          </Guard>
        }
      />
      <Route
        path="/t/:tableId"
        element={
          <Guard>
            <TablePage />
          </Guard>
        }
      />
    </Routes>
  );
}
