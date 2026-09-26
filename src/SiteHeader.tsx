export default function SiteHeader({ name }: { name?: string }) {
  return (
    <header className="site-header">
      <a className="brand" href="/">
        {name || "Gaspampulha"}
      </a>
      <nav aria-label="Principal">
        <a href="/loja">Loja</a>
        <a className="pill" href="/#gas">
          Pedir gás
        </a>
      </nav>
    </header>
  );
}
