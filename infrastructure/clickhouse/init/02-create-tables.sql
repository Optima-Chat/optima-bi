-- ClickHouse 表结构
-- 原始数据表（从 Kafka CDC 同步）

USE bi;

-- 1. 订单表（ReplacingMergeTree - 支持 UPDATE）
CREATE TABLE IF NOT EXISTS orders (
    id UUID,
    merchant_id UUID,
    customer_id Nullable(UUID),
    order_number String,
    customer_email Nullable(String),
    status String,
    amount_subtotal Decimal(10, 2),
    amount_tax Decimal(10, 2),
    amount_shipping Decimal(10, 2),
    amount_total Decimal(10, 2),
    currency String,
    created_at DateTime,
    updated_at DateTime,
    cancelled_at Nullable(DateTime),
    fulfilled_at Nullable(DateTime),
    -- CDC 元数据
    _kafka_offset Int64,
    _kafka_partition Int16,
    _kafka_timestamp DateTime DEFAULT now()
)
ENGINE = ReplacingMergeTree(updated_at)
PARTITION BY toYYYYMM(created_at)
ORDER BY (merchant_id, created_at, id)
SETTINGS index_granularity = 8192;

-- 2. 订单项表
CREATE TABLE IF NOT EXISTS order_items (
    id UUID,
    order_id UUID,
    product_id Nullable(UUID),
    product_title String,
    quantity Int32,
    price Decimal(10, 2),
    total Decimal(10, 2),
    created_at DateTime,
    updated_at DateTime,
    -- CDC 元数据
    _kafka_offset Int64,
    _kafka_partition Int16,
    _kafka_timestamp DateTime DEFAULT now()
)
ENGINE = ReplacingMergeTree(updated_at)
PARTITION BY toYYYYMM(created_at)
ORDER BY (order_id, created_at, id)
SETTINGS index_granularity = 8192;

-- 3. 商品表
CREATE TABLE IF NOT EXISTS products (
    id UUID,
    merchant_id UUID,
    title String,
    description Nullable(String),
    price Decimal(10, 2),
    cost Nullable(Decimal(10, 2)),
    inventory_quantity Int32,
    status String,
    created_at DateTime,
    updated_at DateTime,
    -- CDC 元数据
    _kafka_offset Int64,
    _kafka_partition Int16,
    _kafka_timestamp DateTime DEFAULT now()
)
ENGINE = ReplacingMergeTree(updated_at)
PARTITION BY toYYYYMM(created_at)
ORDER BY (merchant_id, status, created_at, id)
SETTINGS index_granularity = 8192;

-- 4. 客户表
CREATE TABLE IF NOT EXISTS customers (
    id UUID,
    merchant_id UUID,
    email String,
    first_name Nullable(String),
    last_name Nullable(String),
    phone Nullable(String),
    created_at DateTime,
    updated_at DateTime,
    -- CDC 元数据
    _kafka_offset Int64,
    _kafka_partition Int16,
    _kafka_timestamp DateTime DEFAULT now()
)
ENGINE = ReplacingMergeTree(updated_at)
PARTITION BY toYYYYMM(created_at)
ORDER BY (merchant_id, created_at, id)
SETTINGS index_granularity = 8192;

-- 5. 商家表
CREATE TABLE IF NOT EXISTS merchants (
    id UUID,
    name String,
    email String,
    status String,
    created_at DateTime,
    updated_at DateTime,
    -- CDC 元数据
    _kafka_offset Int64,
    _kafka_partition Int16,
    _kafka_timestamp DateTime DEFAULT now()
)
ENGINE = ReplacingMergeTree(updated_at)
ORDER BY (id, created_at)
SETTINGS index_granularity = 8192;
