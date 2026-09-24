export default function AdminNav() {
  return (
    <nav className="admin-nav">
      <a href="/admin">Pedidos</a>
      <a href="/admin/products">Produtos</a>
      <a href="/admin/settings">Configurações</a>
      <a href="/admin/audit">Auditoria</a>
    </nav>
  );
}
