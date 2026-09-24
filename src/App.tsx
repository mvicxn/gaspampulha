import AdminAudit from "./AdminAudit.tsx";
import Admin from "./Admin.tsx";
import AdminLogin from "./AdminLogin.tsx";
import AdminProducts from "./AdminProducts.tsx";
import AdminSettings from "./AdminSettings.tsx";
import Checkout from "./Checkout.tsx";
import Confirmation from "./Confirmation.tsx";
import Store from "./Store.tsx";

export default function App() {
  const path = window.location.pathname;
  if (path === "/checkout") return <Checkout />;
  if (path === "/admin/login") return <AdminLogin />;
  if (path === "/admin") return <Admin />;
  if (path === "/admin/products") return <AdminProducts />;
  if (path === "/admin/settings") return <AdminSettings />;
  if (path === "/admin/audit") return <AdminAudit />;
  if (path.startsWith("/pedido/")) {
    return <Confirmation code={decodeURIComponent(path.slice("/pedido/".length))} />;
  }
  return <Store />;
}
