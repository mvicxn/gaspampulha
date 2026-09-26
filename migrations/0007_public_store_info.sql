INSERT INTO settings (key, value, version)
VALUES ('service_area', '', 1), ('opening_hours', '', 1)
ON CONFLICT(key) DO NOTHING;
