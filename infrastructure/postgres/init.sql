-- PostgreSQL 初始化脚本
-- 创建 commerce-backend 数据库结构（简化版）

-- 启用 UUID 扩展
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 商家表
CREATE TABLE IF NOT EXISTS merchants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    status VARCHAR(50) DEFAULT 'active',
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 商品表
CREATE TABLE IF NOT EXISTS products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id),
    title VARCHAR(500) NOT NULL,
    description TEXT,
    price DECIMAL(10, 2) NOT NULL,
    cost DECIMAL(10, 2),
    inventory_quantity INTEGER DEFAULT 0,
    status VARCHAR(50) DEFAULT 'active',
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 客户表
CREATE TABLE IF NOT EXISTS customers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id),
    email VARCHAR(255) NOT NULL,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    phone VARCHAR(50),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(merchant_id, email)
);

-- 订单表
CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id),
    customer_id UUID REFERENCES customers(id),
    order_number VARCHAR(100) NOT NULL UNIQUE,
    customer_email VARCHAR(255),
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    amount_subtotal DECIMAL(10, 2) NOT NULL DEFAULT 0,
    amount_tax DECIMAL(10, 2) NOT NULL DEFAULT 0,
    amount_shipping DECIMAL(10, 2) NOT NULL DEFAULT 0,
    amount_total DECIMAL(10, 2) NOT NULL DEFAULT 0,
    currency VARCHAR(10) DEFAULT 'CNY',
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    cancelled_at TIMESTAMP,
    fulfilled_at TIMESTAMP
);

-- 订单项表
CREATE TABLE IF NOT EXISTS order_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id),
    product_title VARCHAR(500) NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    price DECIMAL(10, 2) NOT NULL,
    total DECIMAL(10, 2) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 创建索引
CREATE INDEX idx_products_merchant_id ON products(merchant_id);
CREATE INDEX idx_products_status ON products(status);
CREATE INDEX idx_customers_merchant_id ON customers(merchant_id);
CREATE INDEX idx_orders_merchant_id ON orders(merchant_id);
CREATE INDEX idx_orders_customer_id ON orders(customer_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_created_at ON orders(created_at);
CREATE INDEX idx_order_items_order_id ON order_items(order_id);
CREATE INDEX idx_order_items_product_id ON order_items(product_id);

-- 插入测试数据（2个商家）
INSERT INTO merchants (id, name, email, status) VALUES
    ('11111111-1111-1111-1111-111111111111', '示例商家A', 'merchant-a@example.com', 'active'),
    ('22222222-2222-2222-2222-222222222222', '示例商家B', 'merchant-b@example.com', 'active');

-- 插入测试商品
INSERT INTO products (id, merchant_id, title, price, cost, inventory_quantity) VALUES
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'iPhone 15 Pro', 7999.00, 6000.00, 50),
    ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '11111111-1111-1111-1111-111111111111', 'MacBook Pro 16', 19999.00, 15000.00, 20),
    ('cccccccc-cccc-cccc-cccc-cccccccccccc', '22222222-2222-2222-2222-222222222222', 'AirPods Pro', 1999.00, 1200.00, 100);

-- 插入测试客户
INSERT INTO customers (id, merchant_id, email, first_name, last_name) VALUES
    ('c1111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'customer1@example.com', '张', '三'),
    ('c2222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'customer2@example.com', '李', '四'),
    ('c3333333-3333-3333-3333-333333333333', '22222222-2222-2222-2222-222222222222', 'customer3@example.com', '王', '五');

-- 插入测试订单（最近30天）
DO $$
DECLARE
    i INTEGER;
    merchant_id UUID;
    customer_id UUID;
    order_id UUID;
    order_number VARCHAR(100);
    order_date TIMESTAMP;
    order_total DECIMAL(10, 2);
BEGIN
    FOR i IN 1..100 LOOP
        -- 随机选择商家
        IF random() < 0.7 THEN
            merchant_id := '11111111-1111-1111-1111-111111111111';
            customer_id := (ARRAY['c1111111-1111-1111-1111-111111111111', 'c2222222-2222-2222-2222-222222222222'])[floor(random() * 2 + 1)];
        ELSE
            merchant_id := '22222222-2222-2222-2222-222222222222';
            customer_id := 'c3333333-3333-3333-3333-333333333333';
        END IF;

        order_id := uuid_generate_v4();
        order_number := 'ORD' || LPAD(i::TEXT, 6, '0');
        order_date := NOW() - (random() * INTERVAL '30 days');
        order_total := (random() * 5000 + 100)::DECIMAL(10, 2);

        INSERT INTO orders (id, merchant_id, customer_id, order_number, customer_email, status, amount_total, created_at, updated_at)
        VALUES (
            order_id,
            merchant_id,
            customer_id,
            order_number,
            'customer' || i || '@example.com',
            CASE WHEN random() < 0.9 THEN 'paid' ELSE 'pending' END,
            order_total,
            order_date,
            order_date
        );

        -- 插入订单项
        INSERT INTO order_items (order_id, product_id, product_title, quantity, price, total)
        VALUES (
            order_id,
            CASE
                WHEN merchant_id = '11111111-1111-1111-1111-111111111111' THEN 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::UUID
                ELSE 'cccccccc-cccc-cccc-cccc-cccccccccccc'::UUID
            END,
            CASE
                WHEN merchant_id = '11111111-1111-1111-1111-111111111111' THEN 'iPhone 15 Pro'
                ELSE 'AirPods Pro'
            END,
            floor(random() * 3 + 1)::INTEGER,
            order_total / (floor(random() * 3 + 1)::INTEGER),
            order_total
        );
    END LOOP;
END $$;

-- 启用逻辑复制（为 Debezium CDC 准备）
ALTER TABLE merchants REPLICA IDENTITY FULL;
ALTER TABLE products REPLICA IDENTITY FULL;
ALTER TABLE customers REPLICA IDENTITY FULL;
ALTER TABLE orders REPLICA IDENTITY FULL;
ALTER TABLE order_items REPLICA IDENTITY FULL;

-- 创建 Debezium 用户和权限
CREATE USER debezium_user WITH PASSWORD 'debezium_password' REPLICATION;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO debezium_user;
GRANT USAGE ON SCHEMA public TO debezium_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO debezium_user;

-- 创建 publication（Debezium 订阅）
CREATE PUBLICATION dbz_publication FOR TABLE merchants, products, customers, orders, order_items;

-- 显示统计信息
SELECT
    'merchants' as table_name, COUNT(*) as count FROM merchants
UNION ALL
SELECT 'products', COUNT(*) FROM products
UNION ALL
SELECT 'customers', COUNT(*) FROM customers
UNION ALL
SELECT 'orders', COUNT(*) FROM orders
UNION ALL
SELECT 'order_items', COUNT(*) FROM order_items;
