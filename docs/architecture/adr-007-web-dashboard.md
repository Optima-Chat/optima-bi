# ADR-007: Web 可视化界面（Dashboard）

**状态**: ✅ 已采纳
**日期**: 2025-01-21
**决策者**: Optima BI Team

---

## 背景

当前 Optima BI 仅提供 CLI 工具，虽然对 Claude Code 集成友好，但存在以下限制：

1. **学习曲线**：商家需要学习命令行操作
2. **可视化不足**：无法直观展示趋势图表、对比分析
3. **探索性分析困难**：无法交互式探索数据（筛选、下钻、对比）
4. **报表分享困难**：无法生成可分享的报表链接
5. **移动端不友好**：CLI 在移动设备上体验较差

**用户反馈**：
- 商家：*"我想看到销售趋势图，而不是一堆数字"*
- 管理员：*"需要一个仪表盘监控所有商家的实时数据"*
- 数据分析师：*"希望能导出 PDF 报表"*

---

## 决策

**采纳方案**：开发 **Web Dashboard**（bi-web），与现有 bi-cli 并行提供服务。

### 架构定位

```
┌─────────────────────────────────────────────────────────┐
│  Claude Code（AI 分析）                                  │
│    ↓ 调用 bi-cli                                         │
├─────────────────────────────────────────────────────────┤
│  bi-cli（命令行工具）                                    │
│    - 快速查询                                            │
│    - JSON 输出（AI 友好）                                │
│    - 脚本化、自动化                                      │
├─────────────────────────────────────────────────────────┤
│  bi-web（Web Dashboard）← 新增                           │
│    - 可视化图表                                          │
│    - 交互式分析                                          │
│    - 报表导出                                            │
│    - 移动端友好                                          │
├─────────────────────────────────────────────────────────┤
│  bi-backend（API 层）                                    │
│    ↓ 查询 ClickHouse                                    │
│  ClickHouse（OLAP 数据库）                               │
└─────────────────────────────────────────────────────────┘
```

### 技术栈

| 组件 | 技术选择 | 理由 |
|------|---------|------|
| **前端框架** | Next.js 14 (App Router) | SSR/SSG 支持，SEO 友好，TypeScript 原生支持 |
| **UI 组件库** | shadcn/ui + Radix UI | 无头组件，完全可定制，现代化设计 |
| **样式框架** | Tailwind CSS | 快速开发，与 shadcn/ui 配合默契 |
| **图表库** | Recharts | React 原生，声明式 API，轻量级 |
| **状态管理** | React Query (TanStack Query) | 服务端状态管理，自动缓存和重试 |
| **表单** | React Hook Form + Zod | 类型安全，性能优秀 |
| **认证** | NextAuth.js | OAuth 2.0 集成，session 管理 |
| **部署** | Vercel / Docker | 零配置部署 / 自托管灵活性 |

---

## 核心功能

### 1. 商家仪表盘（Merchant Dashboard）

#### 首页概览
```typescript
// 页面: /dashboard
- 关键指标卡片（今日/本周/本月）
  - GMV
  - 订单数
  - 新客户数
  - 转化率

- 销售趋势图（可切换时间范围）
  - 折线图：7天/30天/90天销售趋势
  - 柱状图：每日/每周销售对比

- Top 10 商品（可排序）
  - 按销售额 / 销售量 / 利润排序
  - 点击商品查看详情

- 客户分析
  - 新客 vs 复购客户占比（饼图）
  - 客户生命周期价值（LTV）分布
```

#### 销售分析
```typescript
// 页面: /dashboard/sales
- 时间维度切换（日/周/月/季/年）
- 同比/环比分析
- 销售漏斗图
- 按商品类别分析
- 按地区分析（如果有地理数据）
- 数据导出（CSV/Excel/PDF）
```

#### 客户分析
```typescript
// 页面: /dashboard/customers
- 客户分层（新客/活跃/沉睡/流失）
- 客户画像（RFM 模型）
- 复购率分析
- 客户留存曲线
- 流失预警列表
```

#### 库存管理
```typescript
// 页面: /dashboard/inventory
- 低库存预警（红色高亮）
- 库存周转率
- 滞销商品列表
- 补货建议
```

### 2. 平台仪表盘（Platform Dashboard）- 管理员专用

```typescript
// 页面: /admin/dashboard
- 平台 GMV 实时大屏
- 活跃商家数趋势
- Top 商家排行榜
- 订阅收入分析（MRR/ARR）
- 商家流失分析
- 系统健康监控（ClickHouse 性能、CDC 延迟）
```

### 3. 实时功能

- **WebSocket 实时数据推送**（可选 Phase 2）
  - 实时订单提醒
  - 实时 GMV 滚动显示
  - 实时库存预警

- **数据刷新策略**
  - 关键指标：每 30 秒刷新
  - 图表数据：每 5 分钟刷新
  - 手动刷新按钮

---

## UI/UX 设计原则

### 1. 响应式设计
- 桌面端：三栏布局（侧边栏 + 主内容 + 详情面板）
- 平板端：两栏布局（侧边栏可折叠）
- 移动端：单栏布局 + 底部导航

### 2. 深色模式
- 支持浅色/深色主题切换
- 自动跟随系统设置

### 3. 国际化（i18n）
- 中文（简体/繁体）
- 英文
- 使用 next-intl

### 4. 可访问性
- WCAG 2.1 AA 标准
- 键盘导航支持
- 屏幕阅读器优化

---

## 认证策略

### OAuth 2.0 Web Flow

```typescript
// 使用 NextAuth.js
export default NextAuth({
  providers: [
    {
      id: 'optima-auth',
      name: 'Optima',
      type: 'oauth',
      authorization: {
        url: 'https://auth.optima.chat/oauth/authorize',
        params: { scope: 'read:analytics' }
      },
      token: 'https://auth.optima.chat/oauth/token',
      userinfo: 'https://auth.optima.chat/api/me',
      // ...
    }
  ],
  callbacks: {
    async jwt({ token, account }) {
      if (account) {
        token.accessToken = account.access_token;
        token.role = account.role; // 'merchant' | 'admin'
      }
      return token;
    },
    async session({ session, token }) {
      session.accessToken = token.accessToken;
      session.user.role = token.role;
      return session;
    }
  }
});
```

### Session 管理
- JWT Token 存储在 HttpOnly Cookie
- Refresh Token 自动刷新
- 过期后自动跳转登录页

---

## 数据查询策略

### 1. React Query 缓存

```typescript
// app/hooks/useSalesData.ts
import { useQuery } from '@tanstack/react-query';

export function useSalesData(days: number) {
  return useQuery({
    queryKey: ['sales', days],
    queryFn: async () => {
      const res = await fetch(`/api/sales?days=${days}`);
      return res.json();
    },
    staleTime: 5 * 60 * 1000,  // 5 分钟
    cacheTime: 30 * 60 * 1000, // 30 分钟
    refetchInterval: 5 * 60 * 1000, // 每 5 分钟自动刷新
  });
}
```

### 2. SSR 数据预取

```typescript
// app/dashboard/page.tsx
export default async function DashboardPage() {
  // 服务端预取数据（首屏快速渲染）
  const salesData = await fetchSalesData(7);

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <DashboardClient initialData={salesData} />
    </HydrationBoundary>
  );
}
```

---

## 性能优化

### 1. 代码分割
- 按路由分割（Next.js 自动）
- 按组件懒加载（React.lazy）
- 图表库按需加载

### 2. 图片优化
- Next.js Image 组件
- WebP 格式
- CDN 加速

### 3. 缓存策略
- Static Generation（首页）
- Incremental Static Regeneration（数据页，revalidate: 300）
- Client-side caching（React Query）

### 4. 性能目标
| 指标 | 目标 |
|------|------|
| FCP (First Contentful Paint) | < 1.5s |
| LCP (Largest Contentful Paint) | < 2.5s |
| TTI (Time to Interactive) | < 3s |
| Lighthouse Score | > 90 |

---

## 部署架构

### Option 1: Vercel（推荐）
- 零配置部署
- 全球 CDN
- 自动 HTTPS
- Preview Deployments（每个 PR 自动部署预览）

### Option 2: 自托管 Docker
```yaml
# docker-compose.yml
bi-web:
  build: ./packages/bi-web
  ports:
    - "3000:3000"
  environment:
    - NEXTAUTH_URL=https://bi.optima.chat
    - NEXTAUTH_SECRET=${NEXTAUTH_SECRET}
    - API_URL=http://bi-backend:3001
  depends_on:
    - bi-backend
```

---

## 开发阶段

### Phase 1: MVP（3-4 周）
- [ ] 项目搭建（Next.js 14 + shadcn/ui）
- [ ] OAuth 认证集成（NextAuth.js）
- [ ] 首页概览（关键指标卡片）
- [ ] 销售趋势图（7/30/90 天）
- [ ] Top 10 商品列表
- [ ] 响应式布局（桌面 + 移动）

### Phase 2: 增强功能（2-3 周）
- [ ] 客户分析页面
- [ ] 库存管理页面
- [ ] 数据导出（CSV/Excel/PDF）
- [ ] 深色模式
- [ ] 平台管理员仪表盘

### Phase 3: 高级功能（2 周）
- [ ] 自定义报表构建器
- [ ] 邮件订阅报表（每日/周报）
- [ ] 移动端 App（React Native / PWA）
- [ ] 实时数据推送（WebSocket）

---

## 替代方案（已放弃）

### 方案 A: 纯 CLI（当前方案）
- ❌ 缺乏可视化
- ❌ 学习曲线高
- ✅ AI 集成友好

### 方案 B: 集成到 optima-store
- ❌ 耦合度高
- ❌ 商家看不到分析页面
- ✅ 代码复用

### 方案 C: 使用第三方 BI 工具（Metabase/Superset）
- ❌ 无法定制
- ❌ 部署复杂
- ✅ 开箱即用

---

## 影响

### 正面影响
1. **用户体验提升**：可视化图表，交互式分析
2. **降低使用门槛**：无需学习命令行
3. **移动端支持**：随时随地查看数据
4. **报表分享**：生成可分享的链接
5. **商业价值**：可作为付费增值功能

### 负面影响
1. **开发成本增加**：+3-4 周开发时间
2. **维护成本**：需要维护两套界面（CLI + Web）
3. **性能开销**：服务端渲染增加服务器负载

### 风险缓解
- **开发成本**：分阶段实施，优先 MVP
- **维护成本**：共享 bi-backend API，逻辑复用
- **性能开销**：使用 Vercel Edge Runtime，全球 CDN 加速

---

## 相关决策

- [ADR-001: TypeScript 技术栈](./adr-001-typescript-stack.md) - 统一使用 TypeScript
- [ADR-003: OAuth 2.0 Device Flow](./adr-003-oauth-device-flow.md) - Web 使用传统 OAuth Flow
- [ADR-006: ClickHouse + CDC](./adr-006-clickhouse-olap.md) - Web 直接查询 ClickHouse（通过 bi-backend）

---

## 参考资料

- [Next.js 14 文档](https://nextjs.org/docs)
- [shadcn/ui 组件库](https://ui.shadcn.com/)
- [Recharts 图表库](https://recharts.org/)
- [NextAuth.js 认证](https://next-auth.js.org/)
- [React Query 数据管理](https://tanstack.com/query)

---

**维护者**: Optima BI Team
**最后更新**: 2025-01-21
