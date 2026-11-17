import { lazy, Suspense } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { AuthProvider } from "./context/Auth";
import Layout from "./components/Layout";
import RequireAuth from "./components/RequireAuth";
import { PageLoader } from "./components/ui";
import Home from "./pages/Home";
import Catalog from "./pages/Catalog";
import BookDetail from "./pages/BookDetail";
import { ForgotPassword, Login, Register, ResetPassword } from "./pages/Auth";
import { NotFound, Terms } from "./pages/Static";

// Halaman berat dimuat terpisah supaya beranda cepat terbuka.
const Reader = lazy(() => import("./pages/Reader"));
const Luma = lazy(() => import("./pages/Luma"));
const Discussions = lazy(() => import("./pages/Discussions"));
const DiscussionDetail = lazy(() => import("./pages/DiscussionDetail"));
const DiscussionForm = lazy(() => import("./pages/DiscussionForm"));
const Shelf = lazy(() => import("./pages/Shelf"));
const UploadBook = lazy(() => import("./pages/UploadBook"));
const Profile = lazy(() => import("./pages/Profile"));
const Settings = lazy(() => import("./pages/Settings"));
const Admin = lazy(() => import("./pages/Admin"));

const auth = (el, admin) => <RequireAuth admin={admin}>{el}</RequireAuth>;

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/buku/:id/baca" element={<Reader />} />
            <Route element={<Layout />}>
              <Route index element={<Home />} />
              <Route path="buku" element={<Catalog />} />
              <Route path="buku/:id" element={<BookDetail />} />
              <Route path="buku/:id/ubah" element={auth(<UploadBook />)} />
              <Route path="unggah" element={auth(<UploadBook />)} />
              <Route path="luma" element={auth(<Luma />)} />
              <Route path="diskusi" element={<Discussions />} />
              <Route path="diskusi/baru" element={auth(<DiscussionForm />)} />
              <Route path="diskusi/:id" element={<DiscussionDetail />} />
              <Route path="diskusi/:id/ubah" element={auth(<DiscussionForm />)} />
              <Route path="rak" element={auth(<Shelf />)} />
              <Route path="profil/:username" element={<Profile />} />
              <Route path="pengaturan" element={auth(<Settings />)} />
              <Route path="admin" element={auth(<Admin />, true)} />
              <Route path="masuk" element={<Login />} />
              <Route path="daftar" element={<Register />} />
              <Route path="lupa-password" element={<ForgotPassword />} />
              <Route path="reset-password" element={<ResetPassword />} />
              <Route path="ketentuan" element={<Terms />} />
              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
        </Suspense>
        <ToastContainer position="bottom-right" autoClose={3000} hideProgressBar theme="colored" />
      </BrowserRouter>
    </AuthProvider>
  );
}
