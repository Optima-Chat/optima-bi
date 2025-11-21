# Optima BI - 产品需求文档 (PRD)

## 1. 产品概述

### 1.1 产品定位
Optima BI 是为 Optima Commerce 平台提供的数据智能分析模块，通过 Claude Code 对话式交互，为商家和平台运营团队提供数据洞察和决策支持。

### 1.2 核心价值
- **自然交互**：通过自然语言对话获取数据分析，无需学习复杂的 BI 工具
- **智能分析**：Claude Code 提供深度数据洞察和经营建议
- **即时响应**：基于 CLI 架构，快速返回数据和分析结果
- **灵活扩展**：模块化设计，易于添加新的数据分析能力
- **双向赋能**：同时服务商家经营和平台运营

### 1.3 目标用户

#### 1.3.1 外部用户 - 商家（Merchant Role）
**用户画像**：
- Optima Commerce 平台上的店铺经营者
- 需要数据驱动决策的个人创作者/小型商户
- 希望快速了解店铺经营状况的商家

**核心诉求**：
- 了解店铺销售表现和趋势
- 优化库存管理，避免缺货和积压
- 分析客户行为，提升复购率
- 掌握财务收支，预估到账时间
- 改善物流时效，提升客户满意度

**数据权限**：
- 仅能查看自己店铺的数据（基于 merchant_id 隔离）
- 无法访问其他商家或平台整体数据

#### 1.3.2 内部用户 - 平台运营（Admin/Platform Role）
**用户画像**：
- Optima Commerce 平台运营团队
- 产品经理、数据分析师
- 决策层管理人员

**核心诉求**：
- 了解平台整体GMV和增长趋势
- 监控商家活跃度和留存情况
- 分析订阅会员转化和流失
- 识别增长机会和潜在问题
- 评估运营活动效果

**数据权限**：
- 可访问平台所有数据（跨商家聚合）
- 可查看单个商家详细数据
- 可导出和下载数据报告

## 2. 功能需求

**功能分类说明**：
- 🏪 **商家功能**：仅查看自己店铺数据（merchant_id 隔离）
- 🏢 **平台功能**：可查看平台整体数据或所有商家数据（需管理员权限）
- 🔄 **双角色功能**：商家和平台都可使用，但数据范围不同

---

### 2.1 销售分析 🏪 商家功能
**用户故事**：作为商家，我希望了解店铺的销售表现，以便调整经营策略。

**功能点**：
- 查看指定时间段的销售数据（日、周、月、自定义）
- 销售趋势分析（同比、环比）
- 销售额、订单量、客单价（AOV）等核心指标
- 商品销售排行（Top N）
- 时段销售分布（按小时、星期）
- **订单状态分布**（pending/paid/processing/shipped/delivered/cancelled/refunded）
- **多货币销售分析**（支持12种货币：USD/CNY/JPY/EUR/GBP/HKD/TWD/KRW/VND/AUD/CAD/SGD）
- **价格转换追踪**（用户支付货币 vs 产品基础货币 vs Stripe结算货币）
- **UTM 来源分析**（Google Ads 等营销渠道效果）
- **取消订单分析**（取消原因：payment_timeout/customer_request/out_of_stock）

**典型对话场景**：
```
商家: "帮我看看最近7天的销售情况"
Claude Code:
- 调用 bi-cli sales get --days 7
- 分析数据趋势
- 提供洞察：销售额增长10%，主要来自晚间订单增长
- 建议：可以考虑增加晚间促销活动
```

### 2.2 客户分析 🏪 商家功能
**用户故事**：作为商家，我希望了解客户行为和偏好，以便提供更好的服务。

**功能点**：
- 客户分层（新客、复购客、流失客）
- 客户价值分析（RFM 模型）
- 客户购买偏好（基于 OrderItem 数据）
- **客户地域分布**（基于 shipping_address 中的 country 字段）
- 复购率分析
- **访客订单 vs 注册用户订单**（customer_user_id 为 NULL 表示访客）
- **客户语言偏好**（基于 customer_locale: zh-CN/ja-JP/vi-VN/en-US 等）
- **客户评价分析**（基于 Review 模型）
- **客户生命周期价值** (LTV)

**典型对话场景**：
```
商家: "有多少客户流失了？"
Claude Code:
- 调用 bi-cli customer get --segment churned --period 30d
- 分析流失客户特征
- 建议挽回策略
```

### 2.3 库存分析 🏪 商家功能
**用户故事**：作为商家，我希望优化库存管理，避免缺货和积压。

**功能点**：
- **低库存预警**（基于 Product.stock_quantity 和 low_stock_threshold）
- 滞销商品识别（销售速度低于平均水平）
- **库存周转率**（基于 InventoryLog 变动记录）
- 补货建议（基于历史销售速度和当前库存）
- 库存成本分析
- **变体库存分析**（主商品 vs 变体商品的库存管理）
- **缺货影响分析**（取消订单中 out_of_stock 原因占比）
- **商品状态分析**（draft/active/inactive/archived 状态分布）

**典型对话场景**：
```
商家: "有哪些商品需要补货？"
Claude Code:
- 调用 bi-cli inventory get --status low
- 结合销售趋势分析
- 提供优先补货建议和数量
```

### 2.4 经营报告 🏪 商家功能
**用户故事**：作为商家，我希望定期查看经营报告，全面了解店铺状况。

**功能点**：
- 日报、周报、月报
- 多维度指标汇总
- 关键异常提醒
- 经营健康度评分
- 对比历史表现

**典型对话场景**：
```
商家: "生成本周经营报告"
Claude Code:
- 调用多个 bi-cli 命令获取数据
- 综合分析各维度表现
- 生成结构化报告
- 突出关键问题和机会
```

### 2.5 趋势预测 🔄 双角色功能
**用户故事**：
- **商家**：我希望预测店铺未来趋势，提前做好准备
- **平台**：我希望预测平台整体趋势，制定运营策略

**功能点**：
- 销售趋势预测
- 季节性分析
- 品类增长预测
- 需求波动预警

**典型对话场景**：
```
商家: "预测下个月的销售趋势"
Claude Code:
- 调用 bi-cli trends get --period 90d
- 使用历史数据预测
- 考虑季节因素和促销计划
- 提供预测结果和建议
```

### 2.6 财务分析 🏪 商家功能
**用户故事**：作为商家，我希望了解店铺的财务健康状况和收益情况。

**功能点**：
- **Stripe Connect 分账分析**（基于 MerchantTransfer 模型）
  - 平台费用（platform_fee_percentage，默认5%）
  - 转账延迟期（transfer_delay_days，默认7天）
  - 滚动准备金（rolling_reserve_percentage 和 rolling_reserve_days）
- **订单确认与转账状态**
  - delivery_confirmed_at（确认收货时间）
  - transfer_status（pending/completed/failed/reversed）
  - auto_confirm_date（自动确认日期）
- **多货币收入分析**
  - 用户支付货币（currency, amount_total）
  - Stripe 结算货币（stripe_settlement_currency, stripe_settlement_amount）
  - 汇率影响分析（price_conversion_rate, stripe_conversion_rate）
- **退款分析**（订单状态为 refunded）
- **运费收入分析**（shipping_fee）

**典型对话场景**：
```
商家: "这个月我能拿到多少钱？"
Claude Code:
- 调用 bi-cli finance get --month current
- 分析已完成订单、待转账订单
- 计算平台费用、准备金影响
- 预估实际到账金额和时间
```

### 2.7 物流分析 🏪 商家功能
**用户故事**：作为商家，我希望了解物流配送效率和成本。

**功能点**：
- **配送时效分析**
  - shipped_at 到 delivered_at 的时长
  - 不同物流商（shipping_carrier）的时效对比
- **物流成本分析**（shipping_fee）
- **配送国家分布**（基于 shipping_address.country）
- **Easyship 使用分析**（easyship_shipment_id）
- **订单状态流转分析**
  - pending → paid → processing → shipped → delivered 各阶段耗时
  - 基于 OrderStatusHistory 模型

**典型对话场景**：
```
商家: "平均发货速度是多久？"
Claude Code:
- 调用 bi-cli logistics get --days 30
- 分析 paid 到 shipped 的平均时长
- 对比不同物流商的表现
- 识别发货慢的订单
```

### 2.8 商品表现分析 🏪 商家功能
**用户故事**：作为商家，我希望了解哪些商品表现好，哪些需要优化。

**功能点**：
- **商品销售排行**（基于 OrderItem）
- **变体销售分析**（parent_product vs variants）
- **商品评价分析**（基于 Review 模型）
- **商品标签效果分析**（tags 字段，JSONB）
- **收藏效果分析**（基于 Collection 和 ProductCollection）
- **商品定价分析**
  - price vs original_price（折扣效果）
  - 不同价格区间的销售表现
- **国际化商品表现**（基于 ProductTranslation）
  - 不同语言市场的商品受欢迎程度

**典型对话场景**：
```
商家: "哪个商品卖得最好？"
Claude Code:
- 调用 bi-cli product get --sort-by revenue --days 30
- 分析 Top 10 商品
- 对比评价、库存、变体表现
- 给出热卖商品的共同特征
```

---

## 3. 平台运营功能 🏢

### 3.1 平台整体概览 🏢 平台功能
**用户故事**：作为平台运营，我希望快速了解平台整体健康状况。

**功能点**：
- **平台GMV**（Gross Merchandise Volume，总交易额）
  - 总销售额、订单数、客单价
  - 按时间段统计（日/周/月/季/年）
  - 同比、环比增长率
- **活跃商家数**
  - 总商家数、活跃商家数、新增商家数
  - 商家活跃度定义：30天内有销售订单
- **活跃买家数**
  - 总买家数、活跃买家数、新增买家数
  - 访客订单 vs 注册用户订单占比
- **订单完成率**
  - delivered / paid 的比例
  - 各状态订单分布
- **平均发货时效**
  - paid → shipped 平均时长
  - 各商家时效排行

**典型对话场景**：
```
运营: "给我看看平台本月整体表现"
Claude Code:
- 调用 bi-cli platform overview --month current
- 展示核心指标：GMV、订单数、活跃商家/买家
- 对比上月数据，标注增长/下降趋势
- 识别异常指标（如订单完成率下降）
```

### 3.2 商家分析 🏢 平台功能
**用户故事**：作为平台运营，我希望了解商家的活跃和留存情况。

**功能点**：
- **商家分层分析**
  - 头部商家（Top 10%，贡献80% GMV）
  - 活跃商家（30天内有订单）
  - 沉睡商家（30天无订单）
  - 流失商家（90天无订单）
- **商家生命周期分析**
  - 新商家首单时间分布
  - 商家留存率曲线（次日/7日/30日）
  - 商家月活（MAU）趋势
- **商家GMV排行**
  - Top 商家列表及占比
  - 新晋黑马商家识别
- **商家地域分布**
  - 按商家注册地统计
- **Stripe Connect 接入情况**
  - 已接入 / 未接入商家数
  - onboarding_completed 完成率

**典型对话场景**：
```
运营: "有多少商家本月流失了？"
Claude Code:
- 调用 bi-cli platform merchants --segment churned --month current
- 分析流失商家特征（订阅状态、历史GMV）
- 识别高价值流失商家
- 给出挽回建议
```

### 3.3 订阅会员分析 🏢 平台功能
**用户故事**：作为平台运营，我希望了解商家订阅情况和MRR。

**功能点**：
- **订阅计划分布**（Pro/Enterprise，基于 Subscription 模型）
- **订阅收入分析**
  - MRR（Monthly Recurring Revenue）
  - ARR（Annual Recurring Revenue）
  - 订阅收入占比
- **订阅转化漏斗**
  - 试用 → 付费转化率
  - Free → Pro → Enterprise 升级路径
- **订阅续费率**
  - 月度续费率
  - 流失率（Churn Rate）
- **订阅生命周期价值**（LTV）
- **高价值订阅商家识别**

**典型对话场景**：
```
运营: "本月有多少商家订阅了Pro计划？"
Claude Code:
- 调用 bi-cli platform subscription --plan pro --month current
- 分析新增订阅、续费、流失
- 计算 MRR 和增长率
- 对比不同计划的表现
```

### 3.4 平台商品分析 🏢 平台功能
**用户故事**：作为平台运营，我希望了解平台商品品类和热度分布。

**功能点**：
- **品类分布**（基于 ProductCategory）
  - 各品类商品数量占比
  - 各品类GMV占比
- **热销商品排行**（跨商家）
  - 全平台 Top 100 商品
  - 按品类的热销商品
- **商品定价分析**
  - 不同价格区间的商品数量
  - 平均商品价格趋势
- **商品国际化程度**
  - 有翻译的商品占比
  - 各语言市场的商品覆盖率
- **商品状态分布**
  - draft/active/inactive/archived 占比

**典型对话场景**：
```
运营: "平台上哪个品类最受欢迎？"
Claude Code:
- 调用 bi-cli platform products --group-by category
- 分析各品类的商品数、GMV、订单数
- 识别增长最快的品类
- 给出品类运营建议
```

### 3.5 平台财务分析 🏢 平台功能
**用户故事**：作为平台运营，我希望了解平台收入和分账情况。

**功能点**：
- **平台收入分析**
  - 交易手续费收入（platform_fee）
  - 订阅会员收入
  - 总收入和增长趋势
- **转账分析**（基于 MerchantTransfer）
  - 待转账金额
  - 已转账金额
  - 转账成功率
  - 滚动准备金（rolling_reserve）占用情况
- **多货币收入分析**
  - 各货币 GMV 占比
  - Stripe 汇率影响分析
- **退款分析**
  - 退款率
  - 退款金额占比
  - 高退款率商家识别

**典型对话场景**：
```
运营: "本月平台赚了多少手续费？"
Claude Code:
- 调用 bi-cli platform revenue --month current
- 计算总 GMV 和平台费用（默认5%）
- 加上订阅收入
- 展示收入构成和趋势
```

## 4. 非功能需求

### 4.1 性能要求
- 数据查询响应时间 < 3 秒
- 支持并发多个商家查询
- 数据缓存机制，提升响应速度

### 4.2 数据准确性
- 数据与 Optima Commerce 系统保持一致
- 数据更新延迟 < 5 分钟
- 计算指标准确无误

### 4.3 可扩展性
- 易于添加新的数据维度
- 支持自定义指标
- 模块化设计，便于维护

### 4.4 安全性与权限控制
- **角色隔离**：商家只能访问自己的数据，平台管理员可访问所有数据
- **API 认证**：基于 OAuth 2.0 的身份认证
- **权限验证**：每个请求验证用户角色（merchant/admin）
- **数据脱敏**：对客户敏感信息进行脱敏处理

## 5. 产品边界

### 5.1 包含的功能
- 数据查询和基础计算
- Claude Code 驱动的智能分析
- 结构化数据返回

### 5.2 不包含的功能
- ❌ 独立的 Web 仪表板（通过 Claude Code 交互即可）
- ❌ 实时流数据处理（T+5分钟延迟可接受）
- ❌ 复杂的机器学习模型训练（使用 Claude 的分析能力）
- ❌ 数据导出和下载（Claude Code 可以呈现所需信息）

## 6. 里程碑规划

### Phase 1: MVP（4周）
- ✅ 项目架构搭建
- ✅ bi-cli 基础命令（sales, customer, inventory）
- ✅ bi-backend 核心 API
- ✅ Claude Code 基础对话能力

### Phase 2: 增强功能（4周）
- ✅ 经营报告生成
- ✅ 趋势分析
- ✅ 数据缓存优化
- ✅ 更多数据维度

### Phase 3: 优化迭代（持续）
- ✅ 性能优化
- ✅ 用户反馈迭代
- ✅ 新功能添加

## 7. 成功指标

### 7.1 产品指标
- 商家使用率 > 60%
- 平均每周使用次数 > 3 次
- 数据查询成功率 > 99%

### 7.2 体验指标
- 查询响应时间 < 3 秒
- 商家满意度 > 4.5/5
- Claude Code 分析准确性 > 90%

### 7.3 业务影响
- **商家侧**：帮助商家提升经营效率、数据驱动决策比例提升
- **平台侧**：提升商家留存率、增加平台 GMV、提升订阅转化率

## 8. 风险与挑战

### 8.1 技术风险
- **数据量增长**：大量历史数据可能影响查询性能
- **缓解方案**：数据分层存储，冷热数据分离

### 8.2 体验风险
- **Claude Code 理解偏差**：用户问题表述不清
- **缓解方案**：优化 Prompt，提供示例问题引导

### 8.3 数据风险
- **数据准确性**：与 Optima Commerce 数据不一致
- **缓解方案**：数据校验机制，定期数据对账

## 9. 依赖与前置条件

### 9.1 外部依赖
- **commerce-backend PostgreSQL 数据库**（直接查询现有数据）
- **user-auth OAuth 2.0 服务**（统一认证）
- Claude Code 正常运行
- 商家已开通 Optima Commerce 账号

### 9.2 技术依赖
- **Node.js 18+** (TypeScript)
- **PostgreSQL 14+**（直接连接 commerce-backend 数据库，只读访问）
- **Redis 7+**（缓存查询结果）
- **Fastify/Express**（高性能 TypeScript 后端框架）
- **Prisma/TypeORM**（TypeScript ORM，定义数据模型）

## 10. 附录

### 10.1 术语表
- **bi-cli**：Business Intelligence CLI，数据获取命令行工具
- **bi-backend**：BI 后端服务，数据聚合和查询层
- **commerce-backend**：Optima Commerce 主业务后端，提供电商核心功能
- **GMV**：Gross Merchandise Volume，总交易额
- **MRR**：Monthly Recurring Revenue，月度经常性收入
- **ARR**：Annual Recurring Revenue，年度经常性收入
- **MAU**：Monthly Active Users，月活跃用户
- **Churn Rate**：流失率
- **RFM**：Recency, Frequency, Monetary，客户价值分析模型
- **AOV**：Average Order Value，客单价，平均每笔订单金额
- **LTV**：Lifetime Value，客户生命周期价值
- **Stripe Connect**：Stripe 的分账支付解决方案
- **UTM 参数**：Urchin Tracking Module，用于追踪营销渠道效果

### 10.2 参考资料
- commerce-backend 代码仓库：https://github.com/Optima-Chat/commerce-backend
- commerce-backend 架构文档：docs/ARCHITECTURE.md
- commerce-backend 数据模型清单：docs/ARCHITECTURE_INVENTORY.md
- Claude Code 开发指南：https://docs.claude.com/claude-code
