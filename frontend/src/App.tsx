import { Routes, Route } from 'react-router-dom';
import Header from './component/header/header';
import Footer from './component/footer/footer';
import ProductDetail from './page/productDetail/productDetail';
import Cart from './page/cart/cart';
import Categories from './page/categories/categories';
import Checkout from './page/checkout/checkout';
import MyAccount from './page/myAccount/myAccount';
import styles from './app.module.css';
import Home from './page/home/home';
import Login from './page/login/login';
import Register from './page/register/register';
import { AuthProvider } from './context/authContext/authProvider';
import ProtectedRoute from './component/protectedRoute/protectedRoute';

function App() {
  return (
    <AuthProvider>
      <div className={styles.app}>
        <Header />
        <main className={styles.main}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/producto/:id" element={<ProductDetail />} />
            <Route path="/catalogo" element={<Categories />} />

            <Route
              path="/carrito"
              element={
                <ProtectedRoute permitirInvitados rolesPermitidos={['cliente']}>
                  <Cart />
                </ProtectedRoute>
              }
            />

            <Route
              path="/checkout"
              element={
                <ProtectedRoute rolesPermitidos={['cliente']}>
                  <Checkout />
                </ProtectedRoute>
              }
            />

            <Route
              path="/mi-cuenta"
              element={
                <ProtectedRoute rolesPermitidos={['cliente']}>
                  <MyAccount />
                </ProtectedRoute>
              }
            />

            <Route path="/login" element={<Login key="cliente" tipo="cliente" />} />
            <Route path="/admin/login" element={<Login key="admin" tipo="admin" />} />
            <Route path="/registro" element={<Register />} />
          </Routes>
        </main>
        <Footer />
      </div>
    </AuthProvider>
  );
}

export default App;
