-- ClickHouse 数据库初始化
-- 创建 bi 数据库

CREATE DATABASE IF NOT EXISTS bi;

USE bi;
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
-- ClickHouse Kafka Engine 表
-- 从 Kafka 消费 CDC 消息并写入 ClickHouse

USE bi;

-- 1. Kafka 订单表（消费 Kafka 消息）
CREATE TABLE IF NOT EXISTS orders_kafka (
    id String,
    merchant_id String,
    customer_id Nullable(String),
    order_number String,
    customer_email Nullable(String),
    status String,
    amount_subtotal String,
    amount_tax String,
    amount_shipping String,
    amount_total String,
    currency String,
    created_at String,
    updated_at String,
    cancelled_at Nullable(String),
    fulfilled_at Nullable(String)
)
ENGINE = Kafka()
SETTINGS
    kafka_broker_list = 'kafka:9092',
    kafka_topic_list = 'postgres.public.orders',
    kafka_group_name = 'clickhouse_orders_consumer',
    kafka_format = 'JSONEachRow',
    kafka_num_consumers = 1;

-- 物化视图：将 Kafka 数据写入 orders 表
CREATE MATERIALIZED VIEW IF NOT EXISTS orders_kafka_mv TO orders AS
SELECT
    toUUID(id) AS id,
    toUUID(merchant_id) AS merchant_id,
    if(notEmpty(customer_id), toUUID(customer_id), NULL) AS customer_id,
    order_number,
    customer_email,
    status,
    toDecimal64(amount_subtotal, 2) AS amount_subtotal,
    toDecimal64(amount_tax, 2) AS amount_tax,
    toDecimal64(amount_shipping, 2) AS amount_shipping,
    toDecimal64(amount_total, 2) AS amount_total,
    currency,
    toDateTime(toInt64(created_at) / 1000000) AS created_at,
    toDateTime(toInt64(updated_at) / 1000000) AS updated_at,
    if(notEmpty(cancelled_at), toDateTime(toInt64(cancelled_at) / 1000000), NULL) AS cancelled_at,
    if(notEmpty(fulfilled_at), toDateTime(toInt64(fulfilled_at) / 1000000), NULL) AS fulfilled_at,
    0 AS _kafka_offset,
    0 AS _kafka_partition,
    now() AS _kafka_timestamp
FROM orders_kafka;

-- 2. Kafka 订单项表
CREATE TABLE IF NOT EXISTS order_items_kafka (
    id String,
    order_id String,
    product_id Nullable(String),
    product_title String,
    quantity String,
    price String,
    total String,
    created_at String,
    updated_at String
)
ENGINE = Kafka()
SETTINGS
    kafka_broker_list = 'kafka:9092',
    kafka_topic_list = 'postgres.public.order_items',
    kafka_group_name = 'clickhouse_order_items_consumer',
    kafka_format = 'JSONEachRow',
    kafka_num_consumers = 1;

CREATE MATERIALIZED VIEW IF NOT EXISTS order_items_kafka_mv TO order_items AS
SELECT
    toUUID(id) AS id,
    toUUID(order_id) AS order_id,
    if(notEmpty(product_id), toUUID(product_id), NULL) AS product_id,
    product_title,
    toInt32(quantity) AS quantity,
    toDecimal64(price, 2) AS price,
    toDecimal64(total, 2) AS total,
    toDateTime(toInt64(created_at) / 1000000) AS created_at,
    toDateTime(toInt64(updated_at) / 1000000) AS updated_at,
    0 AS _kafka_offset,
    0 AS _kafka_partition,
    now() AS _kafka_timestamp
FROM order_items_kafka;

-- 3. Kafka 商品表
CREATE TABLE IF NOT EXISTS products_kafka (
    id String,
    merchant_id String,
    title String,
    description Nullable(String),
    price String,
    cost Nullable(String),
    inventory_quantity String,
    status String,
    created_at String,
    updated_at String
)
ENGINE = Kafka()
SETTINGS
    kafka_broker_list = 'kafka:9092',
    kafka_topic_list = 'postgres.public.products',
    kafka_group_name = 'clickhouse_products_consumer',
    kafka_format = 'JSONEachRow',
    kafka_num_consumers = 1;

CREATE MATERIALIZED VIEW IF NOT EXISTS products_kafka_mv TO products AS
SELECT
    toUUID(id) AS id,
    toUUID(merchant_id) AS merchant_id,
    title,
    description,
    toDecimal64(price, 2) AS price,
    if(notEmpty(cost), toDecimal64(cost, 2), NULL) AS cost,
    toInt32(inventory_quantity) AS inventory_quantity,
    status,
    toDateTime(toInt64(created_at) / 1000000) AS created_at,
    toDateTime(toInt64(updated_at) / 1000000) AS updated_at,
    0 AS _kafka_offset,
    0 AS _kafka_partition,
    now() AS _kafka_timestamp
FROM products_kafka;

-- 4. Kafka 客户表
CREATE TABLE IF NOT EXISTS customers_kafka (
    id String,
    merchant_id String,
    email String,
    first_name Nullable(String),
    last_name Nullable(String),
    phone Nullable(String),
    created_at String,
    updated_at String
)
ENGINE = Kafka()
SETTINGS
    kafka_broker_list = 'kafka:9092',
    kafka_topic_list = 'postgres.public.customers',
    kafka_group_name = 'clickhouse_customers_consumer',
    kafka_format = 'JSONEachRow',
    kafka_num_consumers = 1;

CREATE MATERIALIZED VIEW IF NOT EXISTS customers_kafka_mv TO customers AS
SELECT
    toUUID(id) AS id,
    toUUID(merchant_id) AS merchant_id,
    email,
    first_name,
    last_name,
    phone,
    toDateTime(toInt64(created_at) / 1000000) AS created_at,
    toDateTime(toInt64(updated_at) / 1000000) AS updated_at,
    0 AS _kafka_offset,
    0 AS _kafka_partition,
    now() AS _kafka_timestamp
FROM customers_kafka;

-- 5. Kafka 商家表
CREATE TABLE IF NOT EXISTS merchants_kafka (
    id String,
    name String,
    email String,
    status String,
    created_at String,
    updated_at String
)
ENGINE = Kafka()
SETTINGS
    kafka_broker_list = 'kafka:9092',
    kafka_topic_list = 'postgres.public.merchants',
    kafka_group_name = 'clickhouse_merchants_consumer',
    kafka_format = 'JSONEachRow',
    kafka_num_consumers = 1;

CREATE MATERIALIZED VIEW IF NOT EXISTS merchants_kafka_mv TO merchants AS
SELECT
    toUUID(id) AS id,
    name,
    email,
    status,
    toDateTime(toInt64(created_at) / 1000000) AS created_at,
    toDateTime(toInt64(updated_at) / 1000000) AS updated_at,
    0 AS _kafka_offset,
    0 AS _kafka_partition,
    now() AS _kafka_timestamp
FROM merchants_kafka;
-- ClickHouse 物化视图（预聚合表）
-- 自动聚合数据，提升查询性能 50-1000 倍

USE bi;

-- 1. 每日销售汇总（SummingMergeTree）
CREATE TABLE IF NOT EXISTS daily_sales_mv (
    merchant_id UUID,
    date Date,
    total_revenue AggregateFunction(sum, Decimal(10, 2)),
    order_count AggregateFunction(count, UUID),
    avg_order_value AggregateFunction(avg, Decimal(10, 2)),
    unique_customers AggregateFunction(uniq, Nullable(String))
)
ENGINE = AggregatingMergeTree()
PARTITION BY toYYYYMM(date)
ORDER BY (merchant_id, date)
SETTINGS index_granularity = 8192;

-- 物化视图：自动更新 daily_sales_mv
CREATE MATERIALIZED VIEW IF NOT EXISTS daily_sales_mv_update TO daily_sales_mv AS
SELECT
    merchant_id,
    toDate(created_at) AS date,
    sumState(amount_total) AS total_revenue,
    countState(id) AS order_count,
    avgState(amount_total) AS avg_order_value,
    uniqState(customer_email) AS unique_customers
FROM orders
WHERE status IN ('paid', 'delivered', 'completed')
GROUP BY merchant_id, date;

-- 2. 每小时销售汇总（实时监控）
CREATE TABLE IF NOT EXISTS hourly_sales_mv (
    merchant_id UUID,
    hour DateTime,
    total_revenue AggregateFunction(sum, Decimal(10, 2)),
    order_count AggregateFunction(count, UUID)
)
ENGINE = AggregatingMergeTree()
PARTITION BY toYYYYMM(hour)
ORDER BY (merchant_id, hour)
SETTINGS index_granularity = 8192;

CREATE MATERIALIZED VIEW IF NOT EXISTS hourly_sales_mv_update TO hourly_sales_mv AS
SELECT
    merchant_id,
    toStartOfHour(created_at) AS hour,
    sumState(amount_total) AS total_revenue,
    countState(id) AS order_count
FROM orders
WHERE status IN ('paid', 'delivered', 'completed')
GROUP BY merchant_id, hour;

-- 3. 商品销售统计
CREATE TABLE IF NOT EXISTS product_stats_mv (
    merchant_id UUID,
    product_id UUID,
    product_title String,
    date Date,
    quantity_sold AggregateFunction(sum, Int32),
    revenue AggregateFunction(sum, Decimal(10, 2)),
    order_count AggregateFunction(count, UUID)
)
ENGINE = AggregatingMergeTree()
PARTITION BY toYYYYMM(date)
ORDER BY (merchant_id, date, product_id)
SETTINGS index_granularity = 8192;

CREATE MATERIALIZED VIEW IF NOT EXISTS product_stats_mv_update TO product_stats_mv AS
SELECT
    o.merchant_id,
    oi.product_id,
    oi.product_title,
    toDate(o.created_at) AS date,
    sumState(oi.quantity) AS quantity_sold,
    sumState(oi.total) AS revenue,
    countState(o.id) AS order_count
FROM orders o
INNER JOIN order_items oi ON o.id = oi.order_id
WHERE o.status IN ('paid', 'delivered', 'completed')
  AND oi.product_id IS NOT NULL
GROUP BY o.merchant_id, oi.product_id, oi.product_title, date;

-- 4. 客户分析统计
CREATE TABLE IF NOT EXISTS customer_stats_mv (
    merchant_id UUID,
    customer_email String,
    first_order_date AggregateFunction(min, DateTime),
    last_order_date AggregateFunction(max, DateTime),
    total_orders AggregateFunction(count, UUID),
    total_spent AggregateFunction(sum, Decimal(10, 2)),
    avg_order_value AggregateFunction(avg, Decimal(10, 2))
)
ENGINE = AggregatingMergeTree()
ORDER BY (merchant_id, customer_email)
SETTINGS index_granularity = 8192;

CREATE MATERIALIZED VIEW IF NOT EXISTS customer_stats_mv_update TO customer_stats_mv AS
SELECT
    merchant_id,
    customer_email,
    minState(created_at) AS first_order_date,
    maxState(created_at) AS last_order_date,
    countState(id) AS total_orders,
    sumState(amount_total) AS total_spent,
    avgState(amount_total) AS avg_order_value
FROM orders
WHERE status IN ('paid', 'delivered', 'completed')
  AND customer_email != ''
GROUP BY merchant_id, customer_email;

-- 5. 商家总览（平台管理员）
CREATE TABLE IF NOT EXISTS merchant_overview_mv (
    merchant_id UUID,
    date Date,
    total_revenue AggregateFunction(sum, Decimal(10, 2)),
    order_count AggregateFunction(count, UUID),
    unique_customers AggregateFunction(uniq, Nullable(String)),
    active_products AggregateFunction(uniq, Nullable(UUID))
)
ENGINE = AggregatingMergeTree()
PARTITION BY toYYYYMM(date)
ORDER BY (date, merchant_id)
SETTINGS index_granularity = 8192;

CREATE MATERIALIZED VIEW IF NOT EXISTS merchant_overview_mv_update TO merchant_overview_mv AS
SELECT
    merchant_id,
    toDate(created_at) AS date,
    sumState(amount_total) AS total_revenue,
    countState(id) AS order_count,
    uniqState(customer_email) AS unique_customers,
    uniqState(customer_id) AS active_products
FROM orders
WHERE status IN ('paid', 'delivered', 'completed')
GROUP BY merchant_id, date;
