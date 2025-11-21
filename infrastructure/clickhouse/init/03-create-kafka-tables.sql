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
    if(customer_id != '', toUUID(customer_id), NULL) AS customer_id,
    order_number,
    customer_email,
    status,
    toDecimal64(amount_subtotal, 2) AS amount_subtotal,
    toDecimal64(amount_tax, 2) AS amount_tax,
    toDecimal64(amount_shipping, 2) AS amount_shipping,
    toDecimal64(amount_total, 2) AS amount_total,
    currency,
    parseDateTimeBestEffort(created_at) AS created_at,
    parseDateTimeBestEffort(updated_at) AS updated_at,
    if(cancelled_at != '', parseDateTimeBestEffort(cancelled_at), NULL) AS cancelled_at,
    if(fulfilled_at != '', parseDateTimeBestEffort(fulfilled_at), NULL) AS fulfilled_at,
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
    if(product_id != '', toUUID(product_id), NULL) AS product_id,
    product_title,
    toInt32(quantity) AS quantity,
    toDecimal64(price, 2) AS price,
    toDecimal64(total, 2) AS total,
    parseDateTimeBestEffort(created_at) AS created_at,
    parseDateTimeBestEffort(updated_at) AS updated_at,
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
    if(cost != '', toDecimal64(cost, 2), NULL) AS cost,
    toInt32(inventory_quantity) AS inventory_quantity,
    status,
    parseDateTimeBestEffort(created_at) AS created_at,
    parseDateTimeBestEffort(updated_at) AS updated_at,
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
    parseDateTimeBestEffort(created_at) AS created_at,
    parseDateTimeBestEffort(updated_at) AS updated_at,
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
    parseDateTimeBestEffort(created_at) AS created_at,
    parseDateTimeBestEffort(updated_at) AS updated_at,
    0 AS _kafka_offset,
    0 AS _kafka_partition,
    now() AS _kafka_timestamp
FROM merchants_kafka;
