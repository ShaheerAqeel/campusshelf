import { Link, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import { LoginPage, RegisterPage } from './pages/AuthPages.jsx';
import CataloguePage from './pages/CataloguePage.jsx';
import BookDetailPage from './pages/BookDetailPage.jsx';
import MyLoansPage from './pages/MyLoansPage.jsx';
import DashboardPage from './pages/staff/DashboardPage.jsx';
import ManageBooksPage from './pages/staff/ManageBooksPage.jsx';
import ManageLoansPage from './pages/staff/ManageLoansPage.jsx';
import UsersPage from './pages/staff/UsersPage.jsx';

function NotFound() {
  return (
    <div className="py-16 text-center">
      <h1 className="text-4xl">Page not found</h1>
      <p className="mt-2 text-muted">This shelf is empty.</p>
      <Link to="/" className="btn-primary mt-6">Back to the catalogue</Link>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<CataloguePage />} />
        <Route path="books/:id" element={<BookDetailPage />} />
        <Route path="login" element={<LoginPage />} />
        <Route path="register" element={<RegisterPage />} />
        <Route element={<ProtectedRoute />}>
          <Route path="loans" element={<MyLoansPage />} />
        </Route>
        <Route element={<ProtectedRoute roles={['librarian', 'admin']} />}>
          <Route path="staff/dashboard" element={<DashboardPage />} />
          <Route path="staff/books" element={<ManageBooksPage />} />
          <Route path="staff/loans" element={<ManageLoansPage />} />
        </Route>
        <Route element={<ProtectedRoute roles={['admin']} />}>
          <Route path="admin/users" element={<UsersPage />} />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
