# CodeAgent 使用示例

本目录包含 CodeAgent 的各种使用示例和场景演示。

## 目录

- [基础使用](#基础使用)
- [代码理解](#代码理解)
- [代码搜索](#代码搜索)
- [重构辅助](#重构辅助)
- [Bug 调查](#bug-调查)
- [文档生成](#文档生成)

## 基础使用

### 示例 1: 索引项目

```bash
# 进入项目目录
cd /path/to/your/project

# 索引整个项目
code-agent index

# 查看索引统计
code-agent stats
```

**输出示例**:
```
Indexing project...
✓ Scanned 150 files
✓ Parsed 145 files
✓ Indexed 1,234 symbols
✓ Created 2,567 relationships

Statistics:
  Files: 145
  Nodes: 1,234
  Edges: 2,567
  Languages:
    - TypeScript: 120 files
    - Python: 25 files
```

### 示例 2: 搜索符号

```bash
# 搜索类
code-agent search UserService

# 搜索函数
code-agent search calculateScore

# 搜索并查看详情
code-agent node UserService
```

**输出示例**:
```
Found 1 result:

UserService (class)
  File: src/services/UserService.ts
  Lines: 10-45
  Signature: export class UserService
  
  Methods:
    - constructor(db: Database)
    - getUser(id: string): Promise<User>
    - createUser(data: UserData): Promise<User>
    - updateUser(id: string, data: Partial<UserData>): Promise<User>
```

## 代码理解

### 示例 3: 理解模块设计

```bash
code-agent run "解释一下 UserService 的设计和职责"
```

**Agent 响应**:
```
让我分析 UserService 的设计...

[使用 codeGraphNode 查询 UserService]
[使用 codeGraphCallees 查找依赖]
[使用 read 读取源代码]

UserService 的设计分析：

1. **职责**：
   - 用户数据的 CRUD 操作
   - 用户验证和权限检查
   - 与数据库层交互

2. **依赖**：
   - Database - 数据库连接
   - UserValidator - 用户数据验证
   - Logger - 日志记录

3. **设计模式**：
   - 使用依赖注入（构造函数注入 Database）
   - 遵循单一职责原则
   - 所有方法都是异步的，返回 Promise

4. **关键方法**：
   - getUser() - 通过 ID 获取用户
   - createUser() - 创建新用户，包含验证
   - updateUser() - 更新用户信息
   - deleteUser() - 软删除用户

5. **改进建议**：
   - 可以考虑添加缓存层
   - 错误处理可以更统一
   - 建议添加单元测试
```

### 示例 4: 追踪调用链

```bash
code-agent run "查看 createOrder 函数的完整调用链"
```

**Agent 响应**:
```
分析 createOrder 的调用链...

[使用 codeGraphCallers 查找调用者]
[使用 codeGraphCallees 查找被调用者]

调用链分析：

入口点：
  OrderController.create() 
    ↓ calls
  OrderService.createOrder()
    ↓ calls
  ├─ UserService.getUser()
  │   ↓ calls
  │   └─ Database.query()
  ├─ ProductService.checkStock()
  │   ↓ calls
  │   └─ InventoryService.getStock()
  └─ PaymentService.processPayment()
      ↓ calls
      ├─ PaymentGateway.charge()
      └─ TransactionLogger.log()

依赖的外部服务：
  - Database
  - PaymentGateway
  - InventoryService

潜在问题：
  - createOrder 依赖多个服务，可能需要事务管理
  - 如果 PaymentService 失败，需要回滚库存
```

## 代码搜索

### 示例 5: 查找所有 API 端点

```bash
code-agent run "列出所有的 API 端点和它们的处理函数"
```

**Agent 响应**:
```
搜索 API 端点...

[使用 grep 搜索路由定义]
[使用 codeGraphSearch 查找控制器]

找到的 API 端点：

GET /api/users
  Handler: UserController.list()
  File: src/controllers/UserController.ts:15

GET /api/users/:id
  Handler: UserController.get()
  File: src/controllers/UserController.ts:25

POST /api/users
  Handler: UserController.create()
  File: src/controllers/UserController.ts:35

PUT /api/users/:id
  Handler: UserController.update()
  File: src/controllers/UserController.ts:45

DELETE /api/users/:id
  Handler: UserController.delete()
  File: src/controllers/UserController.ts:55

GET /api/orders
  Handler: OrderController.list()
  File: src/controllers/OrderController.ts:20

POST /api/orders
  Handler: OrderController.create()
  File: src/controllers/OrderController.ts:30

总计：7 个端点
```

### 示例 6: 查找未使用的代码

```bash
code-agent run "查找可能未使用的函数和类" --tools full
```

**Agent 响应**:
```
分析未使用的代码...

[使用 codeGraphSearch 获取所有符号]
[使用 codeGraphCallers 检查调用者]

可能未使用的代码：

函数：
  1. formatDate() - src/utils/date.ts:10
     - 没有找到调用者
     - 建议：确认是否需要，或添加到导出

  2. validateEmail() - src/utils/validation.ts:25
     - 没有找到调用者
     - 注意：可能是新添加的功能

类：
  1. OldUserService - src/services/OldUserService.ts:5
     - 没有找到引用
     - 建议：如果已废弃，可以删除

  2. LegacyParser - src/parsers/LegacyParser.ts:10
     - 没有找到引用
     - 建议：检查是否可以安全删除

注意：这些可能是：
  - 新添加但尚未使用的代码
  - 通过反射或动态调用的代码
  - 测试代码
  - 导出给外部使用的 API

建议手动确认后再删除。
```

## 重构辅助

### 示例 7: 重命名符号

```bash
code-agent run "将 getUserById 重命名为 findUserById，并更新所有引用" --tools full
```

**Agent 响应**:
```
执行重命名操作...

[使用 codeGraphNode 查找符号]
[使用 codeGraphRefs 查找所有引用]

找到 getUserById 的定义：
  - src/services/UserService.ts:25

找到 5 处引用：
  1. src/controllers/UserController.ts:15
  2. src/controllers/UserController.ts:30
  3. src/services/OrderService.ts:45
  4. tests/UserService.test.ts:20
  5. tests/UserService.test.ts:35

[使用 edit 工具更新每个文件]

✓ 更新 src/services/UserService.ts
✓ 更新 src/controllers/UserController.ts
✓ 更新 src/services/OrderService.ts
✓ 更新 tests/UserService.test.ts

重命名完成！
  - 更新了 4 个文件
  - 修改了 6 处代码

建议：
  - 运行测试确保没有破坏功能
  - 检查是否有动态调用需要更新
```

### 示例 8: 提取公共代码

```bash
code-agent run "分析 UserService 和 OrderService，找出可以提取的公共代码" --agent plan
```

**Agent 响应**:
```
分析公共代码...

[读取 UserService 和 OrderService]
[比较代码结构]

发现的公共模式：

1. **CRUD 操作模式**
   相似度：85%
   
   UserService:
   ```typescript
   async getById(id: string) {
     const result = await this.db.query('SELECT * FROM users WHERE id = ?', [id]);
     if (!result) throw new NotFoundError('User not found');
     return result;
   }
   ```
   
   OrderService:
   ```typescript
   async getById(id: string) {
     const result = await this.db.query('SELECT * FROM orders WHERE id = ?', [id]);
     if (!result) throw new NotFoundError('Order not found');
     return result;
   }
   ```
   
   建议：提取为 BaseService 的通用方法

2. **验证逻辑**
   相似度：70%
   
   两个服务都有类似的验证流程：
   - 检查必填字段
   - 验证数据格式
   - 检查业务规则
   
   建议：创建 Validator 基类或使用装饰器

3. **错误处理**
   相似度：90%
   
   两个服务使用相同的错误处理模式
   
   建议：提取为统一的错误处理中间件

重构建议：
1. 创建 BaseService 类
2. 提取公共的 CRUD 方法
3. 统一验证逻辑
4. 统一错误处理

预期收益：
  - 减少约 200 行重复代码
  - 提高代码可维护性
  - 统一业务逻辑
```

## Bug 调查

### 示例 9: 调查错误来源

```bash
code-agent run "调查为什么 createOrder 会抛出 'User not found' 错误"
```

**Agent 响应**:
```
调查错误来源...

[使用 codeGraphNode 查找 createOrder]
[使用 codeGraphCallees 追踪调用]
[使用 grep 搜索错误信息]

错误追踪：

1. 错误抛出位置：
   src/services/UserService.ts:30
   ```typescript
   if (!user) {
     throw new NotFoundError('User not found');
   }
   ```

2. 调用链：
   OrderController.create()
     → OrderService.createOrder()
       → UserService.getUser()  ← 这里抛出错误

3. 可能的原因：
   
   a) 用户 ID 无效
      - 检查：OrderService.createOrder() 接收的 userId
      - 位置：src/services/OrderService.ts:45
      
   b) 用户已被删除
      - UserService.getUser() 不查询已删除用户
      - 可能需要检查 deleted_at 字段
      
   c) 数据库连接问题
      - 查询可能失败但没有正确处理

4. 建议的修复：
   
   方案 1：添加更详细的错误信息
   ```typescript
   throw new NotFoundError(`User not found: ${userId}`);
   ```
   
   方案 2：在 createOrder 前验证用户
   ```typescript
   const user = await this.userService.getUser(userId);
   if (!user) {
     throw new ValidationError('Invalid user ID');
   }
   ```
   
   方案 3：添加日志
   ```typescript
   this.logger.debug('Looking up user', { userId });
   const user = await this.db.query(...);
   if (!user) {
     this.logger.warn('User not found', { userId });
     throw new NotFoundError('User not found');
   }
   ```

5. 相关测试：
   tests/OrderService.test.ts:50 - 测试无效用户 ID
   建议：添加更多边界情况测试
```

### 示例 10: 性能分析

```bash
code-agent run "分析 getOrderList 的性能问题"
```

**Agent 响应**:
```
分析性能问题...

[读取 getOrderList 实现]
[分析调用的方法]
[检查数据库查询]

性能分析：

1. 当前实现：
   src/services/OrderService.ts:100
   ```typescript
   async getOrderList(userId: string) {
     const orders = await this.db.query('SELECT * FROM orders WHERE user_id = ?', [userId]);
     
     for (const order of orders) {
       order.user = await this.userService.getUser(order.user_id);  // N+1 问题！
       order.items = await this.getOrderItems(order.id);            // N+1 问题！
     }
     
     return orders;
   }
   ```

2. 发现的问题：
   
   a) **N+1 查询问题**
      - 对每个订单都查询用户信息
      - 对每个订单都查询订单项
      - 如果有 100 个订单，会执行 201 次查询！
   
   b) **缺少分页**
      - 一次性加载所有订单
      - 数据量大时会很慢
   
   c) **没有使用索引**
      - user_id 字段可能没有索引

3. 优化建议：
   
   方案 1：使用 JOIN 查询
   ```typescript
   async getOrderList(userId: string) {
     const query = `
       SELECT o.*, u.name as user_name, u.email as user_email
       FROM orders o
       LEFT JOIN users u ON o.user_id = u.id
       WHERE o.user_id = ?
     `;
     return await this.db.query(query, [userId]);
   }
   ```
   
   方案 2：批量加载
   ```typescript
   async getOrderList(userId: string) {
     const orders = await this.db.query('SELECT * FROM orders WHERE user_id = ?', [userId]);
     const userIds = [...new Set(orders.map(o => o.user_id))];
     const users = await this.userService.getUsersByIds(userIds);
     
     // 映射用户到订单
     const userMap = new Map(users.map(u => [u.id, u]));
     orders.forEach(o => o.user = userMap.get(o.user_id));
     
     return orders;
   }
   ```
   
   方案 3：添加分页
   ```typescript
   async getOrderList(userId: string, page = 1, limit = 20) {
     const offset = (page - 1) * limit;
     const query = `
       SELECT * FROM orders 
       WHERE user_id = ? 
       LIMIT ? OFFSET ?
     `;
     return await this.db.query(query, [userId, limit, offset]);
   }
   ```

4. 预期改进：
   - 查询次数：201 → 2-3 次
   - 响应时间：~2000ms → ~50ms
   - 内存使用：减少 80%

5. 建议的实施步骤：
   1. 添加数据库索引
   2. 实现批量加载
   3. 添加分页
   4. 添加缓存（可选）
   5. 性能测试验证
```

## 文档生成

### 示例 11: 生成 API 文档

```bash
code-agent run "为 UserService 生成 API 文档" --tools full
```

**Agent 响应**:
```
生成 API 文档...

[读取 UserService 源代码]
[分析方法签名和注释]
[生成 Markdown 文档]

# UserService API 文档

## 概述

UserService 负责用户数据的管理，包括创建、查询、更新和删除操作。

## 构造函数

### `constructor(db: Database, logger: Logger)`

创建 UserService 实例。

**参数**:
- `db` (Database) - 数据库连接
- `logger` (Logger) - 日志记录器

## 方法

### `getUser(id: string): Promise<User>`

通过 ID 获取用户信息。

**参数**:
- `id` (string) - 用户 ID

**返回值**:
- `Promise<User>` - 用户对象

**异常**:
- `NotFoundError` - 用户不存在

**示例**:
```typescript
const user = await userService.getUser('user-123');
console.log(user.name);
```

### `createUser(data: CreateUserData): Promise<User>`

创建新用户。

**参数**:
- `data` (CreateUserData) - 用户数据
  - `name` (string) - 用户名
  - `email` (string) - 邮箱
  - `password` (string) - 密码

**返回值**:
- `Promise<User>` - 创建的用户对象

**异常**:
- `ValidationError` - 数据验证失败
- `DuplicateError` - 邮箱已存在

**示例**:
```typescript
const user = await userService.createUser({
  name: 'John Doe',
  email: 'john@example.com',
  password: 'secret123',
});
```

### `updateUser(id: string, data: Partial<UpdateUserData>): Promise<User>`

更新用户信息。

**参数**:
- `id` (string) - 用户 ID
- `data` (Partial<UpdateUserData>) - 要更新的字段

**返回值**:
- `Promise<User>` - 更新后的用户对象

**异常**:
- `NotFoundError` - 用户不存在
- `ValidationError` - 数据验证失败

**示例**:
```typescript
const user = await userService.updateUser('user-123', {
  name: 'Jane Doe',
});
```

### `deleteUser(id: string): Promise<void>`

删除用户（软删除）。

**参数**:
- `id` (string) - 用户 ID

**返回值**:
- `Promise<void>`

**异常**:
- `NotFoundError` - 用户不存在

**示例**:
```typescript
await userService.deleteUser('user-123');
```

## 类型定义

### User

```typescript
interface User {
  id: string;
  name: string;
  email: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}
```

### CreateUserData

```typescript
interface CreateUserData {
  name: string;
  email: string;
  password: string;
}
```

### UpdateUserData

```typescript
interface UpdateUserData {
  name?: string;
  email?: string;
  password?: string;
}
```

---

文档已保存到：docs/api/UserService.md
```

## 更多示例

查看 `examples/` 目录下的其他示例：

- `examples/basic/` - 基础使用示例
- `examples/advanced/` - 高级用法
- `examples/integration/` - 集成示例
- `examples/workflows/` - 工作流示例

## 贡献示例

如果你有好的使用示例，欢迎贡献！请参考 [贡献指南](../CONTRIBUTING.md)。
