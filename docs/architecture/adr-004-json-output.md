# ADR-004: JSON 默认输出 + Pretty 选项

**状态**: ✅ 已采纳
**日期**: 2025-01-21
**决策者**: Optima BI Team

---

## 背景

bi-cli 需要选择输出格式，主要用户：
1. **Claude Code**（AI）：需要结构化数据进行分析
2. **人类用户**：需要可读的彩色表格

主要候选方案：
1. **JSON 默认** + `--pretty` 选项
2. **表格默认** + `--json` 选项

---

## 决策

**bi-cli 默认输出 JSON 格式，支持 `--pretty` 选项输出彩色表格**

### 输出格式
- **默认**: JSON（AI 友好）
- **Pretty 模式**: 彩色表格（人类可读）
- **响应结构**: 统一的 `{ success, data, message, error }` 格式

---

## 理由

### 1. AI 优先
- **核心用户是 Claude Code**，需要 JSON 数据
- JSON 易于解析和处理
- 结构化数据更适合 AI 分析

```bash
# Claude Code 调用
bi-cli sales get --days 7

# 输出（JSON）
{
  "success": true,
  "data": {
    "total_revenue": 12500.00,
    "order_count": 150,
    "avg_order_value": 83.33
  }
}

# Claude Code 解析后生成分析报告
```

### 2. 可编程
- 脚本和自动化工具可轻松处理 JSON
- 支持管道操作（`bi-cli ... | jq`）
- 便于集成到其他系统

```bash
# 提取特定字段
bi-cli sales get --days 7 | jq '.data.total_revenue'
# 输出: 12500.00
```

### 3. 向后兼容
- 参考 commerce-cli 的设计
- 保持 Optima CLI 家族一致性
- 用户熟悉的输出格式

### 4. 灵活切换
- `--pretty` 选项满足手动调试需求
- 人类用户体验不受影响
- 一个命令，两种输出

---

## 输出格式设计

### 统一响应结构

```typescript
interface CliResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}
```

### JSON 模式（默认）

```bash
$ bi-cli sales get --days 7
```

输出：
```json
{
  "success": true,
  "data": {
    "total_revenue": 12500.00,
    "order_count": 150,
    "avg_order_value": 83.33,
    "period": {
      "start": "2024-01-08",
      "end": "2024-01-15"
    },
    "daily_breakdown": [
      { "date": "2024-01-15", "revenue": 2000.00, "orders": 25 },
      { "date": "2024-01-14", "revenue": 1800.00, "orders": 22 }
    ]
  }
}
```

### Pretty 模式

```bash
$ bi-cli sales get --days 7 --pretty
```

输出：
```
┌────────────────────────────────────┐
│  销售概览（最近 7 天）              │
├────────────────────────────────────┤
│  总销售额:    $12,500.00           │
│  订单数量:    150                  │
│  客单价:      $83.33               │
│  时间范围:    2024-01-08 ~ 2024-01-15 │
└────────────────────────────────────┘

每日明细:
┌────────────┬──────────────┬────────────┐
│ 日期       │ 销售额       │ 订单数     │
├────────────┼──────────────┼────────────┤
│ 2024-01-15 │ $2,000.00    │ 25         │
│ 2024-01-14 │ $1,800.00    │ 22         │
│ 2024-01-13 │ $1,700.00    │ 20         │
│ ...        │ ...          │ ...        │
└────────────┴──────────────┴────────────┘
```

### 错误输出

```bash
$ bi-cli sales get --days 7
```

输出（JSON）：
```json
{
  "success": false,
  "error": "Unauthorized",
  "message": "Token expired. Please run 'bi-cli auth login'"
}
```

输出（Pretty）：
```
❌ 错误: Unauthorized

Token 已过期，请重新登录:
  bi-cli auth login
```

---

## 替代方案

### 方案 A: 表格默认 + `--json` 选项

**描述**:
```bash
# 默认输出表格
$ bi-cli sales get --days 7
┌────────────┬──────────────┐
│ 日期       │ 销售额       │
...

# JSON 输出需要 --json 选项
$ bi-cli sales get --days 7 --json
{"success": true, "data": {...}}
```

**优势**:
- 人类用户体验更好（默认可读）

**劣势**:
- **不适合 AI**：Claude Code 需要每次加 `--json`
- 颠倒优先级（AI 是核心用户）
- 与 commerce-cli 不一致

**结论**: ❌ 放弃

---

## 影响

### 正面影响

1. **AI 友好**:
   - Claude Code 可直接解析 JSON
   - 无需额外处理
   - 分析更准确

2. **可编程**:
   - 脚本和自动化工具易于使用
   - 支持管道操作
   - 便于集成

3. **一致性**:
   - 与 commerce-cli 保持一致
   - Optima CLI 家族统一风格
   - 用户学习成本低

4. **灵活性**:
   - `--pretty` 满足手动调试需求
   - 一个命令，两种输出
   - 不影响人类用户体验

### 负面影响

1. **首次使用体验**:
   - 人类用户首次使用看到 JSON 可能困惑
   - 需要在文档中说明 `--pretty` 选项

### 缓解措施

1. **文档说明**:
   ```
   bi-cli 默认输出 JSON 格式（适合 Claude Code 解析）。
   如需人类可读的输出，请使用 --pretty 选项。
   ```

2. **帮助信息**:
   ```bash
   $ bi-cli sales get --help

   Options:
     --pretty    输出彩色表格（人类可读）
     --json      输出 JSON（默认，AI 友好）
   ```

3. **错误提示**:
   ```
   提示: 使用 --pretty 选项可以输出更易读的格式
   ```

---

## 实施细节

### JSON 序列化

```typescript
function outputJson(data: any): void {
  console.log(JSON.stringify(data, null, 0));
}
```

### Pretty 输出

```typescript
import chalk from 'chalk';
import Table from 'cli-table3';

function outputPretty(data: SalesData): void {
  // 概览卡片
  console.log(chalk.bold('📊 销售概览（最近 7 天）'));
  console.log(`总销售额: ${chalk.green('$' + data.total_revenue)}`);
  console.log(`订单数量: ${chalk.blue(data.order_count)}`);
  console.log(`客单价: ${chalk.yellow('$' + data.avg_order_value)}`);
  console.log();

  // 表格
  const table = new Table({
    head: ['日期', '销售额', '订单数'],
    style: { head: ['cyan'] }
  });

  data.daily_breakdown.forEach(day => {
    table.push([
      day.date,
      '$' + day.revenue.toFixed(2),
      day.orders
    ]);
  });

  console.log(table.toString());
}
```

### 命令行参数

```typescript
import { Command } from 'commander';

const program = new Command();

program
  .command('sales get')
  .option('--days <number>', '统计天数', '7')
  .option('--pretty', '输出彩色表格')
  .action(async (options) => {
    const data = await fetchSalesData(options.days);

    if (options.pretty) {
      outputPretty(data);
    } else {
      outputJson({ success: true, data });
    }
  });
```

---

## 相关决策

- [ADR-001: TypeScript 技术栈](./adr-001-typescript-stack.md) - TypeScript 类型安全
- [ADR-003: OAuth Device Flow](./adr-003-oauth-device-flow.md) - CLI 认证

---

## 参考资料

- [commerce-cli 输出设计](https://github.com/Optima-Chat/commerce-cli)
- [chalk: Terminal colors](https://github.com/chalk/chalk)
- [cli-table3: Pretty tables](https://github.com/cli-table/cli-table3)
- [jq: JSON processor](https://stedolan.github.io/jq/)

---

**批准者**: Optima BI Team
**实施负责人**: CLI Team
**风险等级**: 🟢 低（成熟方案）
