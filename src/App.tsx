import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useEffect } from "react";
import { useAuthStore } from "./store/authStore";
import Login from "./pages/Login";
import AdminDashboard from "./pages/admin/Dashboard";
import UserDashboard from "./pages/user/Dashboard";
import CourseView from "./pages/user/CourseView";
import AssessmentPreCheck from "./pages/user/AssessmentPreCheck";
import AssessmentView from "./pages/user/AssessmentView";

function ProtectedRoute({ children, role }: { children: React.ReactNode; role?: "admin" | "user" | "admin2" }) {
  const { user, token } = useAuthStore();
  
  if (!token) return <Navigate to="/login" replace />;
  
  if (role === "admin" && user?.role !== "admin" && user?.role !== "admin2") return <Navigate to="/" replace />;
  if (role === "user" && user?.role !== "user") return <Navigate to="/" replace />;
  
  return <>{children}</>;
}

export default function App() {
  const { user, checkAuth } = useAuthStore();

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        
        {/* Admin Routes */}
        <Route path="/admin/*" element={
          <ProtectedRoute role="admin">
            <AdminDashboard />
          </ProtectedRoute>
        } />

        {/* User Routes */}
        <Route path="/user/*" element={
          <ProtectedRoute role="user">
            <UserDashboard />
          </ProtectedRoute>
        } />
        
        <Route path="/course/:courseId" element={
          <ProtectedRoute role="user">
            <CourseView />
          </ProtectedRoute>
        } />

        <Route path="/course/:courseId/assessment/precheck" element={
          <ProtectedRoute role="user">
            <AssessmentPreCheck />
          </ProtectedRoute>
        } />

        <Route path="/course/:courseId/assessment" element={
          <ProtectedRoute role="user">
            <AssessmentView />
          </ProtectedRoute>
        } />

        {/* Redirect based on role */}
        <Route path="/" element={
          (user?.role === "admin" || user?.role === "admin2") ? <Navigate to="/admin" replace /> : 
          user?.role === "user" ? <Navigate to="/user" replace /> : 
          <Navigate to="/login" replace />
        } />
      </Routes>
    </BrowserRouter>
  );
}
