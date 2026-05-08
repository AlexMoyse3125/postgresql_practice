BEGIN;

-- Keep the practice schema small but join-friendly.

CREATE TABLE users (
  id            BIGSERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE categories (
  id            BIGSERIAL PRIMARY KEY,
  name          TEXT NOT NULL UNIQUE
);

CREATE TABLE products (
  id            BIGSERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  price_cents   INTEGER NOT NULL CHECK (price_cents >= 0),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE product_categories (
  product_id    BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  category_id   BIGINT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  PRIMARY KEY (product_id, category_id)
);

CREATE TABLE orders (
  id            BIGSERIAL PRIMARY KEY,
  user_id       BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE order_items (
  order_id      BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id    BIGINT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  qty           INTEGER NOT NULL CHECK (qty > 0),
  PRIMARY KEY (order_id, product_id)
);

COMMIT;

