BEGIN;

INSERT INTO users (name, email) VALUES
  ('Ada Lovelace', 'ada@example.com'),
  ('Grace Hopper', 'grace@example.com'),
  ('Alan Turing', 'alan@example.com'),
  ('Katherine Johnson', 'katherine@example.com');

INSERT INTO categories (name) VALUES
  ('Books'),
  ('Gadgets'),
  ('Food'),
  ('Office');

INSERT INTO products (name, price_cents) VALUES
  ('SQL Pocket Guide', 1999),
  ('Mechanical Keyboard', 8999),
  ('Coffee Beans (1lb)', 1599),
  ('Notebook', 499),
  ('Noise-cancelling Headphones', 12999),
  ('Pencils (12 pack)', 299);

-- product_categories (many-to-many)
INSERT INTO product_categories (product_id, category_id)
SELECT p.id, c.id
FROM (VALUES
  ('SQL Pocket Guide', 'Books'),
  ('Mechanical Keyboard', 'Gadgets'),
  ('Coffee Beans (1lb)', 'Food'),
  ('Notebook', 'Office'),
  ('Noise-cancelling Headphones', 'Gadgets'),
  ('Pencils (12 pack)', 'Office')
) AS pc(product_name, category_name)
JOIN products p ON p.name = pc.product_name
JOIN categories c ON c.name = pc.category_name;

-- orders
INSERT INTO orders (user_id, created_at)
SELECT u.id, now() - (v.days_ago || ' days')::interval
FROM (VALUES
  ('ada@example.com', 2),
  ('grace@example.com', 1),
  ('alan@example.com', 7),
  ('katherine@example.com', 0)
) AS v(email, days_ago)
JOIN users u ON u.email = v.email;

-- order_items (composite PK)
INSERT INTO order_items (order_id, product_id, qty)
SELECT o.id, p.id, v.qty
FROM (VALUES
  ('ada@example.com', 'SQL Pocket Guide', 1),
  ('ada@example.com', 'Notebook', 2),
  ('grace@example.com', 'Mechanical Keyboard', 1),
  ('grace@example.com', 'Coffee Beans (1lb)', 3),
  ('alan@example.com', 'Noise-cancelling Headphones', 1),
  ('katherine@example.com', 'Pencils (12 pack)', 4),
  ('katherine@example.com', 'Notebook', 1)
) AS v(email, product_name, qty)
JOIN users u ON u.email = v.email
JOIN orders o ON o.user_id = u.id
JOIN products p ON p.name = v.product_name;

COMMIT;

