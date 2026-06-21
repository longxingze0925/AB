# APK 落地分发系统 — 部署说明

配置驱动的落地页 + 跳转 + 信息采集系统。入口域名池、出口域名池均可后台一键切换,链接与下载内容不变。

## 架构

```
[控制中心 = 主站后台(只你访问)]  存配置 + 访问数据 + 管理界面
        │  入口/出口都来这里读"当前该用什么"
   ┌────┴─────┐
[入口域名池]      [出口域名池]
 用户点击          触发 APK 下载
 记录信息+跳转      读直链下载
```

所有会变的东西(入口域名、出口域名、APK直链、图片)只存在数据库,入口/出口都是"读配置干活"。换任何域名 = 后台点一下,链接不变、内容不变。

## 一键部署

前提:一台 Linux VPS(Ubuntu/Debian/CentOS 均可)。

### 方式 1:远程一键安装(推荐)

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/longxingze0925/AB/main/ops/install.sh)
```

脚本会自动:
1. 检查并安装 Docker + Docker Compose(如未安装)
2. 下载项目代码
3. 下载 IP 地理库(ip2asn IPv4/IPv6 + 城市库)
4. 交互式配置(后台域名、管理员账号密码)
5. 启动服务

安装完成后会显示登录信息,保存在 `/opt/apk-landing/credentials.txt`。

### 方式 2:手动部署

```bash
# 1. 克隆项目
git clone https://github.com/longxingze0925/AB.git
cd AB

# 2. 配置环境变量
cp .env.example .env
nano .env  # 必改:MAIN_DOMAIN, ADMIN_PASSWORD, SESSION_SECRET

# 3. 启动
docker compose up -d --build
```

## IP 地理库(国内外定位)

系统精确到「国家/省/市 + 运营商」,国内外通用。**安装时自动下载两个库**,无需手动操作:

| 库 | 作用 | 大小 |
|---|---|---|
| ip2asn-v4.tsv | IPv4 全球运营商(国内识别为电信/联通/移动) | ~6MB 压缩 |
| ip2asn-v6.tsv | IPv6 全球运营商/机房 ASN 识别 | ~8MB 压缩 |
| dbip-city-lite-*.mmdb | 全球国家 + 省 + 市 | ~30MB 压缩 |

运行 `ops/install.sh` 时会自动从 iptoasn.com 和 db-ip.com 下载最新版并解压到 `geodata/`。

> **离线部署:**若服务器无外网,可提前在本机下载好放进 `geodata/`,安装脚本检测到已存在就会跳过下载。

## DNS 怎么配

- 把**所有**入口域名、出口域名、以及后台主域名的 A 记录,统统指向这台服务器的公网 IP。
- Caddy 已开启 on-demand TLS:后台新增域名后,该域名首次被访问时自动签发 HTTPS 证书,无需手动操作。
- 安全:`/api/tls-check` 接口会校验请求的域名是否已在你的域名池/主域名内,只给这些域名签证书,防止被人拿你服务器刷证书。

## 日常使用

全部在网页后台完成,不用再碰服务器:
- 增删入口域名、出口域名,一键切换"当前启用"。
- 填写/修改 APK 下载直链、展示图片、标题。
- 创建推广码,把链接 `https://当前入口域名/?c=推广码` 发给各渠道/分站。
- 查看访问数据:每个访客一行,可按推广码/时间筛选。

## 换域名(被封时)

1. 后台「出口域名」里新增一个域名(提前把 DNS 解析好)。
2. 点「设为当前」。
3. 立即生效,入口链接不变、下载内容不变。
入口域名同理。

## 备份

数据全在 Docker volume `app_data` 里的 `app.db`(SQLite)。备份就是导出这个文件:

```bash
docker compose exec app sh -c "cp /data/app.db /data/backup-$(date +%F).db"
```

## 合规提示

采集 IP/设备等访客信息、分发 APK,请确保在你的合法运营范围内,下载内容本身合规。
