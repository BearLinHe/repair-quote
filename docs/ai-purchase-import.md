# AI 采购单识别（第一版）

入口：采购入库 → 拍照 / AI 识别入库（`/purchases/import`）。

## 工作流与边界

1. 选择入库所属账号，拍照或上传单页 JPG、PNG、WebP。手机原图上限 40 MB，浏览器会压缩为高可读性的 JPEG（最长边最多 2800 px，编码后不超过 3.2 MB），留存的是上传副本，不是未经压缩的原始文件。
2. 点击识别，将图片发送到 OpenAI。使用 Responses API + strict structured outputs；不使用模型工具调用，图片内文字只能作为待识别数据。`store: false` 不代表提供商零数据保留，具体保留政策以 OpenAI 账户协议为准。
3. 人工核对供应商、Invoice 编号、日期、每行完整供应商编号、Ship 数量、实际单价（非 List Price）、行金额与总额。历史供应商编号映射 / 完整 SKU 匹配只给建议；名称搜索由用户选择。
4. CORE 和其他费用单独分类，不生成库存零件。税费、运费等不摊入现有库存平均成本。所有金额以整数分验证：数量 × 单价 = 行金额；各行之和 = 小计；小计 + 附加费用 = 总额。
5. 确认实收后保存采购草稿。新 SKU、采购明细、编号映射、审核结果与操作审计在同一事务中提交，此时库存仍未增加。再从采购记录确认入库，复用现有采购入库事务。

第一版仅支持 USD、单页、非负金额、整数库存数量。部分收货、退货/贷项、外币、折扣负数、多页发票请使用人工流程；不要为通过校验而修改真实金额。付款和退还 CORE 押金管理不在本次范围内。

相同账号 + 文件字节哈希不会重复识别成功文件；相同账号 + 规范化供应商 + 供应商 Invoice 编号不会重复建采购单。编号保留前后缀与标点，只规范大小写和空白。已取消订单也保留重复检测；不要通过改变单号绕过，后续如需重新导入应增加明确的作废重建流程。

每账号同一时间只允许一次识别，滚动 24 小时最多 30 次尝试（同一旧记录的多次重试保守累计）。暂未做服务端队列；识别超时或失败可重传同一图片重试，成功结果可从最近识别记录重新打开。离开页面前的编辑未保存时会丢失，原识别结果仍保留。

## 服务端配置与上线

- 安装依赖：`npm install`。
- 本地 `.env.local` / 部署环境中设置 `OPENAI_API_KEY`；禁止使用 `NEXT_PUBLIC_` 前缀，禁止提交密钥。
- 可配置 `OPENAI_INVOICE_MODEL`，默认 `gpt-4.1-mini`（需支持图片输入与结构化输出）。
- API 账户需有可用余额和模型权限。模型查询成功不代表有推理额度。
- 应用增量迁移：`npx prisma migrate deploy`，然后重新部署。
- Vercel 环境需要允许识别路由最长 120 秒运行。上传请求控制在平台正文限制以内；超过 100 行请分单处理。
- 原单副本、识别与核对数据存于 `PurchaseImport`；通过鉴权接口读取，不嵌入采购列表响应。供应商编号映射存于 `SupplierPartMapping`，按数据所属账号隔离。
- 目前文件保留与 DB 备份沿用业务数据库策略；大批量使用时可迁移到私有对象存储并设置保留期限。

## 测试

```sh
node --import tsx --test tests/*.test.ts
PURCHASE_IMPORT_DB_TEST=1 node --env-file=.env --import tsx --test tests/purchase-import-db.test.ts
npm run build
```

数据库集成测试使用隔离的临时账号命名空间，整个事务无条件回滚，不写入实际库存。

官方 API 参考：[图片输入](https://developers.openai.com/api/docs/guides/images-vision)、[结构化输出](https://developers.openai.com/api/docs/guides/structured-outputs)、[模型能力](https://developers.openai.com/api/docs/models/gpt-4.1-mini)。
