import { Routes, Route, Navigate, Outlet } from 'react-router-dom';
import Header from './component/header/header';
import Footer from './component/footer/footer';
import ProductDetail from './page/productDetail/productDetail';
import Cart from './page/cart/cart';
import Checkout from './page/checkout/checkout';
import styles from './app.module.css';
import Home from './page/home/home';
import Categories from './page/categories/categories';
import Login from './page/login/login';
import Register from './page/register/register';
import { AuthProvider } from './context/authContext/authProvider';
// import Contact from './page/contact/contact';
// import AboutUs from './page/aboutUs/aboutUs';
import ProtectedRoute from './component/protectedRoute/protectedRoute';
import CatalogProvider from './context/catalogContext/catalogProvider';
import Order from './page/order/order';
import MyAccount from './page/myAccount/myAccount';
import MyOrders from './page/myAccount/page/myOrders/myOrders';
import MyData from './page/myAccount/page/myData/myData';
import EditData from './page/myAccount/page/myData/editData';
import ChangePassword from './page/myAccount/page/myData/changePassword';
import DeleteAccount from './page/myAccount/page/myData/deleteAccount';
import AdminLayout from './page/admin/adminLayout';
import Admin from './page/admin/admin';
import Orders from './page/admin/page/orders/orders';

// Layout de la tienda: Header + contenido + Footer. El admin NO pasa por acá.
function ClientLayout() {
  return (
    <div className={styles.app}>
      <Header />
      <main className={styles.main}>
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <CatalogProvider>
        <Routes>
          {/* ---------- Tienda (clientes) ---------- */}
          <Route element={<ClientLayout />}>
            <Route path="/" element={<Home />} />
            {/* Pendiente: <Route path="/contacto" element={<Contact />} /> */}
            {/* Pendiente: <Route path="/sobre-nosotros" element={<AboutUs />} /> */}
            <Route path="/producto/:id" element={<ProductDetail />} />
            <Route path="/carrito" element={<Cart />} />
            <Route path="/categorias" element={<Categories />} />
            <Route path="/login" element={<Login tipo="cliente" />} />
            <Route path="/registro" element={<Register />} />

            <Route element={<ProtectedRoute tipo="cliente" />}>
              <Route path="/checkout" element={<Checkout />} />
              <Route path="/pedido/:id" element={<Order />} />
              <Route path="/mi-cuenta" element={<MyAccount />}>
                <Route index element={<Navigate to="pedidos" replace />} />
                <Route path="pedidos" element={<MyOrders />} />
                <Route path="datos" element={<MyData />} />
                <Route path="datos/editar" element={<EditData />} />
                <Route path="datos/contrasena" element={<ChangePassword />} />
                <Route path="datos/eliminar" element={<DeleteAccount />} />
              </Route>
            </Route>
          </Route>

          {/* ---------- Administración (sin Header ni Footer) ---------- */}
          <Route path="/admin" element={<AdminLayout />}>
            <Route path="login" element={<Login tipo="admin" />} />
            <Route element={<ProtectedRoute tipo="admin" />}>
              <Route element={<Admin />}>
                <Route index element={<Navigate to="pedidos" replace />} />
                <Route path="pedidos" element={<Orders />} />
              </Route>
            </Route>
          </Route>
        </Routes>
      </CatalogProvider>
    </AuthProvider>
  );
}

export default App;