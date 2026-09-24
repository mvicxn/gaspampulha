-- Dados iniciais do comércio. Sem administrador e sem senha.
-- O primeiro admin entra só depois do benchmark de CPU da fase de autenticação.
-- Reaplicar não sobrescreve valor que o comércio já preencheu.

INSERT INTO settings (key, value) VALUES
  ('store_name', 'Gaspampulha'),
  ('whatsapp_number', '5531999990000'),
  ('pix_key', '')
ON CONFLICT(key) DO UPDATE SET value = excluded.value
WHERE settings.value = '';

INSERT INTO products (id, name, category, price_cents, active, sort_order) VALUES
  (1, 'Galão 20 litros', 'agua', 1800, 1, 1),
  (2, 'Galão 10 litros', 'agua', 1200, 1, 2),
  (3, 'Botijão 13 kg', 'gas', 12000, 1, 1),
  (4, 'Botijão reservado', 'gas', 9000, 0, 2)
ON CONFLICT(id) DO NOTHING;
