import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './AuthContext.jsx'
import LoginPage from './pages/LoginPage.jsx'
import CampaignsPage from './pages/CampaignsPage.jsx'
import CampaignRoomPage from './pages/CampaignRoomPage.jsx'

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <p className="p-8 text-slate-400">Loading…</p>
  if (!user) return <Navigate to="/login" replace />
  return children
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/campaigns"
        element={
          <ProtectedRoute>
            <CampaignsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/campaigns/:campaignId"
        element={
          <ProtectedRoute>
            <CampaignRoomPage />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/campaigns" replace />} />
    </Routes>
  )
}
