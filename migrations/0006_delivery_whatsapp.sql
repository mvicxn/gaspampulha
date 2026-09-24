INSERT INTO settings (key, value, version)
VALUES ('delivery_whatsapp_number', '', 1)
ON CONFLICT(key) DO NOTHING;
