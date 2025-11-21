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
    unique_customers AggregateFunction(uniq, String)
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
    unique_customers AggregateFunction(uniq, String),
    active_products AggregateFunction(uniq, UUID)
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
