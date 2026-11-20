# iOS 云编译操作清单（Codemagic + 免费侧载）

本项目 iOS 编译**完全不需要花钱、不需要 Mac**。全程在 Windows + 网页上完成：

> 云端 macOS 编译出「未签名 IPA」 → 本机用**免费 Apple ID** 给 IPA 签名 → 装到 iPhone

代价是：App **每 7 天要续签一次**（下面会讲自动续签，几乎无感）；不能上架 App Store、不能用 TestFlight。对你这种自己用的记录类 App 完全够。

---

## 三条路线对比

| 路线 | 花费 | 能用多久 | 适合谁 |
|---|---|---|---|
| **① 未签名 IPA + 免费侧载**（推荐） | ¥0 | 7 天续签一次 | 自己一台 iPhone 用，不想花钱 |
| ② 模拟器编译验证 | ¥0 | 只在电脑模拟器里跑 | 只想确认代码能不能编译 |
| ③ 开发者账号 + TestFlight | $99/年 | 90 天/版本，可邀请别人 | 要分发给多人或上架 |

本清单主讲路线 ①。路线 ③ 的配置（`ios-testflight`）我也保留在 `codemagic.yaml` 里，将来想用了再说。

---

## 已为你准备好的文件

| 文件 | 作用 |
|---|---|
| `codemagic.yaml` | 3 个工作流：`ios-unsigned-ipa`（免费主推）、`ios-simulator-check`（验证）、`ios-testflight`（付费备选） |
| `ios/App/App.xcodeproj/xcshareddata/xcschemes/App.xcscheme` | 共享 scheme，云端命令行编译必需 |
| `ios/`（整个目录） | iOS 原生工程骨架，5 个插件已通过 SPM 接入，无特殊 entitlements（利于侧载） |
| `src/utils/nativePlatform.js` 及已改造代码 | Android/iOS 平台适配（Excel 导出改系统分享等） |

---

## 第一步：准备一个「专门用于侧载」的免费 Apple ID

- 可以用你现有的 Apple ID，但**强烈建议单独注册一个免费的**——因为要把账号密码填进侧载工具，跟主账号（绑着支付、iCloud）分开更安全。
- 注册网址：https://appleid.apple.com ，免费，开启双重认证。
- 免费账号的硬性限制（苹果定的，所有工具都一样）：
  - 签名的 App **7 天过期**，到期要重新签；
  - 每台设备同时最多装 **3 个**侧载 App（含侧载工具自身）；
  - 每 7 天最多注册 10 个新的 App ID。

---

## 第二步：Windows 安装侧载工具 Sideloadly

1. 打开官网 https://sideloadly.io 下载 Windows 版（免费，认准官网，别下第三方修改版）。
2. **先装 Apple 官方的网页版 iTunes 和 iCloud**（Sideloadly 官网有链接）——注意**不要**用 Microsoft Store 版，否则会识别不到 iPhone。装完重启电脑。
3. 准备一根 USB 数据线（首次连接需要）。

> 备选：AltStore（https://altstore.io ）也免费、体验更好（同 WiFi 自动续签），但 Windows 端配置略繁琐。想省事先用 Sideloadly，稳定后再换。

---

## 第三步：Codemagic 云端编译出未签名 IPA（约 15–25 分钟）

1. **把项目推到 Git 仓库**
   - GitHub / GitLab / Bitbucket 新建一个**私有**仓库，把整个 `E:\record-main` 推上去。
   - 必须包含 `patches/` 目录（printer 插件补丁，`npm ci` 依赖它）。
   - `node_modules/`、`dist/` 已被 gitignore，不用传。

2. **连接 Codemagic**
   - https://codemagic.io 用 Git 账号登录（免费版个人每月有 macOS 构建额度）。
   - Add application → 选刚才的私有仓库 → 自动扫描到 `codemagic.yaml`。

3. **启动构建**
   - 进入应用 → 选工作流 **「iOS 未签名 IPA（供免费侧载）」**（`ios-unsigned-ipa`）→ Start new build。
   - 完成后在 Artifacts 里下载 **`futou-unsigned.ipa`** 到 Windows 本地。
   - 若构建失败：把日志发我，我来修。

---

## 第四步：用 Sideloadly 签名并装到 iPhone

1. USB 数据线连接 iPhone，手机上点「信任此电脑」。
2. 打开 Sideloadly，设备列表里应出现你的 iPhone。
3. 把下载好的 `futou-unsigned.ipa` 拖进 Sideloadly。
4. 填入第一步准备的**免费 Apple ID 和密码**，点 **Start**。
   - 弹二次验证就输入发到手机上的验证码。
   - Sideloadly 会用你的证书重新签名并安装。
5. 手机上完成两件信任设置：
   - 设置 → 通用 → **VPN 与设备管理** → 点你的 Apple ID → **信任**；
   - iOS 16 及以上：设置 → 隐私与安全性 → **开发者模式** → 开启并重启（首次打开 App 要联网验证一次证书）。
6. 桌面上出现「腹透记录」图标，打开就能用了。数据都存在 App 沙盒里，跟正常 App 一样。

---

## 第五步：7 天续签（关键）

免费证书 7 天后 App 会打不开（**数据不会丢**）。三种续签方式，任选：

- **手动**（最简单）：到期前把同一个 IPA 再拖进 Sideloadly 点一次 Start，覆盖安装即可，数据保留。
- **自动刷新**（Sideloadly）：首次侧载时勾选自动刷新，电脑开着 + 手机同 WiFi，守护进程会在到期前自动重签。在 iTunes 里开启「通过 WiFi 同步此 iPhone」。
- **完全摆脱电脑**（进阶）：改用 SideStore（https://sidestore.io ），首次用电脑装好后，之后手机自己就能续签，不用每次连电脑。

> 提醒：别用所谓「企业证书 / 共享证书」的免费分发平台，苹果会批量吊销，装上的 App 会集体失效。用你自己的 Apple ID 最稳。

---

## 已知限制（免费方案固有，非项目 bug）

- 7 天续签、每设备最多 3 个侧载 App——苹果对免费账号的硬性规定。
- **不能上架 App Store、不能邀请别人通过 TestFlight 安装**（那需要 $99 账号）。
- 没法用推送通知、App 内购买等需要付费账号能力的功能——本项目没用到，不影响。
- 首次打开 App 需联网做一次证书验证。

---

## 常见问题

- **Sideloadly 识别不到 iPhone**：确认装的是 Apple 官网网页版 iTunes/iCloud（不是 Store 版），重装后重启，换根数据线。
- **提示 "Maximum number of apps"（3 个上限）**：在 Sideloadly/AltStore 里停用一个不用的 App 腾出名额，数据不会丢。
- **App 打开闪退**：多半是开发者模式没开，或证书过期。开启开发者模式 / 重新侧载一次。
- **patch-package 报错**：确认 `patches/` 目录已提交到仓库。
- **scheme not found**：确认 `xcshareddata/xcschemes/App.xcscheme` 已提交。
- **免费分钟不够**：个人每月有免费额度，单次构建约 15–25 分钟；配置里已设为手动触发，不跑就不扣。
- **bundle id 冲突**：若 Sideloadly 提示 bundle id 相关问题，可在 Sideloadly 高级选项里改一个（如 `com.komany.futou2`）再签，不影响功能。

---

## 附：将来想用付费 TestFlight（可选）

账号到手后，用 `ios-testflight` 工作流即可，配置要点都在 `codemagic.yaml` 注释里：需在 App Store Connect 创建 App 记录、生成 API Key（.p8）、在 Codemagic 配 Developer Portal 集成名 `futou_appstore`，并把 `APP_STORE_APPLE_ID` 和邮箱两个占位符改掉。这里不再展开。
