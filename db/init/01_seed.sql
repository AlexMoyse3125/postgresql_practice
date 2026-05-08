BEGIN;

INSERT INTO users (name, email) VALUES
  ('Ada Lovelace', 'ada@example.com'),
  ('Grace Hopper', 'grace@example.com'),
  ('Alan Turing', 'alan@example.com'),
  ('Katherine Johnson', 'katherine@example.com'),
  ('Edsger Dijkstra', 'edsger@example.com'),
  ('Barbara Liskov', 'barbara@example.com'),
  ('Donald Knuth', 'donald@example.com'),
  ('Linus Torvalds', 'linus@example.com'),
  ('Margaret Hamilton', 'margaret@example.com'),
  ('Tim Berners-Lee', 'tim@example.com');

INSERT INTO categories (name) VALUES
  ('Books'),
  ('Gadgets'),
  ('Food'),
  ('Office'),
  ('Clothing'),
  ('Outdoors'),
  ('Kitchen'),
  ('Health');

INSERT INTO products (name, price_cents) VALUES
  ('SQL Pocket Guide', 1999),
  ('Mechanical Keyboard', 8999),
  ('Coffee Beans (1lb)', 1599),
  ('Notebook', 499),
  ('Noise-cancelling Headphones', 12999),
  ('Pencils (12 pack)', 299),
  ('Hiking Socks', 1299),
  ('Water Bottle', 1899),
  ('Stainless Pan', 4499),
  ('Tea Sampler', 1399),
  ('Desk Lamp', 2499),
  ('USB-C Hub', 3299),
  ('Protein Bars (12)', 2099),
  ('First Aid Kit', 2799),
  ('Cookbook: Simple Meals', 2299),
  ('Backpack', 5499);

-- product_categories (many-to-many)
INSERT INTO product_categories (product_id, category_id)
SELECT p.id, c.id
FROM (VALUES
  ('SQL Pocket Guide', 'Books'),
  ('Cookbook: Simple Meals', 'Books'),
  ('Mechanical Keyboard', 'Gadgets'),
  ('USB-C Hub', 'Gadgets'),
  ('Coffee Beans (1lb)', 'Food'),
  ('Tea Sampler', 'Food'),
  ('Protein Bars (12)', 'Food'),
  ('Notebook', 'Office'),
  ('Desk Lamp', 'Office'),
  ('Noise-cancelling Headphones', 'Gadgets'),
  ('Pencils (12 pack)', 'Office'),
  ('Hiking Socks', 'Clothing'),
  ('Water Bottle', 'Outdoors'),
  ('Backpack', 'Outdoors'),
  ('First Aid Kit', 'Health'),
  ('Stainless Pan', 'Kitchen')
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
  ('katherine@example.com', 0),
  ('edsger@example.com', 3),
  ('barbara@example.com', 5),
  ('donald@example.com', 10),
  ('linus@example.com', 4),
  ('margaret@example.com', 6),
  ('tim@example.com', 8),
  -- extra orders (multiple per user)
  ('ada@example.com', 12),
  ('grace@example.com', 14),
  ('katherine@example.com', 9),
  ('linus@example.com', 1),
  ('tim@example.com', 2)
) AS v(email, days_ago)
JOIN users u ON u.email = v.email;

-- order_items (composite PK)
INSERT INTO order_items (order_id, product_id, qty)
SELECT o.id, p.id, v.qty
FROM (VALUES
  -- Use email + days_ago to target a specific order for users with multiple orders.
  ('ada@example.com', 2,  'SQL Pocket Guide', 1),
  ('ada@example.com', 2,  'Notebook', 2),
  ('grace@example.com', 1,'Mechanical Keyboard', 1),
  ('grace@example.com', 1,'Coffee Beans (1lb)', 3),
  ('alan@example.com', 7, 'Noise-cancelling Headphones', 1),
  ('katherine@example.com', 0,'Pencils (12 pack)', 4),
  ('katherine@example.com', 0,'Notebook', 1),
  ('edsger@example.com', 3,'USB-C Hub', 1),
  ('edsger@example.com', 3,'Desk Lamp', 1),
  ('barbara@example.com', 5,'Cookbook: Simple Meals', 1),
  ('barbara@example.com', 5,'Stainless Pan', 1),
  ('donald@example.com', 10,'SQL Pocket Guide', 1),
  ('donald@example.com', 10,'Tea Sampler', 2),
  ('linus@example.com', 4,'Backpack', 1),
  ('linus@example.com', 4,'Water Bottle', 1),
  ('margaret@example.com', 6,'First Aid Kit', 1),
  ('margaret@example.com', 6,'Protein Bars (12)', 2),
  ('tim@example.com', 8,'Mechanical Keyboard', 1),
  ('tim@example.com', 8,'USB-C Hub', 1),
  -- extra orders
  ('ada@example.com', 12,'Coffee Beans (1lb)', 2),
  ('ada@example.com', 12,'Tea Sampler', 1),
  ('grace@example.com', 14,'Notebook', 5),
  ('grace@example.com', 14,'Pencils (12 pack)', 2),
  ('katherine@example.com', 9,'Desk Lamp', 1),
  ('katherine@example.com', 9,'SQL Pocket Guide', 1),
  ('linus@example.com', 1,'Noise-cancelling Headphones', 1),
  ('linus@example.com', 1,'Water Bottle', 2),
  ('tim@example.com', 2,'Backpack', 1),
  ('tim@example.com', 2,'Hiking Socks', 3)
) AS v(email, days_ago, product_name, qty)
JOIN users u ON u.email = v.email
JOIN orders o
  ON o.user_id = u.id
 AND o.created_at >= now() - (v.days_ago || ' days')::interval - interval '2 minutes'
 AND o.created_at <= now() - (v.days_ago || ' days')::interval + interval '2 minutes'
JOIN products p ON p.name = v.product_name;

COMMIT;

