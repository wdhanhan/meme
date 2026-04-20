# 集群部署操作手册

> 目标:backend 放美国一台机器,GPU 节点放沙特(或任意区域)多台机器。节点自注册,backend 自动发现,全程走 Tailscale 私网加密。

---

## 一、角色和机器

| 角色 | 部署几台 | 跑什么 | 要不要打快照 |
|---|---|---|---|
| **Backend** | 1 台(美国) | postgres + meme-c 后端 + nginx | 不打,长期跑 |
| **GPU 节点** | N 台(沙特…) | fish-speech 服务 + tailscale + 心跳 | **第一台**做成黄金镜像,后面全从它克隆 |

两边通过 Tailscale 组私网互通。backend 的公网只开 443(给用户),**fish 的 8080+ 不开公网**。

---

## 二、准备动作(只做一次)

### 2.1 Tailscale 账号 + authkey

1. 注册 https://login.tailscale.com (用 GitHub/Google 登录就行,免费额度 100 台机器)
2. 进 **Settings → Keys → Generate auth key**
3. 勾上:
   - ✅ **Reusable**(可复用,因为要起多台)
   - ✅ **Pre-approved**(免人工审批)
   - Expiration 设 **90 天**
   - Tags 填 `tag:gpu-worker`(可选,用来做 ACL)
4. 生成后把那串 `tskey-auth-xxxxxxxxx` **立刻存下来**,后面每开一台 GPU 都要用

### 2.2 共享密钥

已经在 `meme-c/scripts/deploy.sh` 里写死:

```
MEMEC_CLUSTER_TOKEN=8060c13da2cf86913c604b75b90c7a9259a18a5a74ca659d7786a57cf0980752
```

节点那边的 `MEMEC_CLUSTER_TOKEN` 必须和这个一模一样,否则注册会 401。

---

## 三、Backend 这台机怎么配

### 3.1 应用改动

```bash
cd /root/meme
./start --only meme-c     # 重新部署 backend,让 MEMEC_CLUSTER_TOKEN 环境变量生效
```

看到 `[OK] Meme C deployed.` 就行。

### 3.2 装 Tailscale

```bash
curl -fsSL https://tailscale.com/install.sh | sh
tailscale up --hostname=memec-backend --ssh
```

第一次会让你去浏览器点一下授权(或者也能用上面的 authkey 非交互)。跑完:

```bash
tailscale ip -4
```

**把打印出来的那个 `100.x.x.x` 记下来**,例如 `100.64.0.1`,后面 GPU 节点要写。

### 3.3 验证一下

```bash
# 看 backend 知不知道自己有这个 token
curl -s -H "X-Cluster-Token: 8060c13da2cf86913c604b75b90c7a9259a18a5a74ca659d7786a57cf0980752" \
  http://127.0.0.1:8090/api/internal/nodes
```

应该返回 `{"items":null}` 或 `{"items":[]}`(还没节点,空是正常的)。

如果返回 `{"error":"cluster api disabled"}` → token 没生效,检查 deploy.sh 和环境变量。

---

## 四、第一台 GPU 节点(做成黄金镜像)

### 4.1 起一台空机器

在云上开一台 GPU 实例,要求:
- Ubuntu 22.04+
- **NVIDIA driver 已装好**(`nvidia-smi` 能看到卡)
- 至少 100 GB 磁盘(fish 模型要占几十 G)

### 4.2 把代码传过去

在 backend 机上:

```bash
rsync -avz --exclude='.git' --exclude='meme-c/data/postgres' --exclude='node_modules' \
  /root/meme/ root@<gpu机公网IP>:/root/meme/
```

### 4.3 烘镜像

SSH 到 GPU 机上:

```bash
ssh root@<gpu机公网IP>
sudo bash /root/meme/meme/scripts/build-gpu-image.sh
```

这一步会:
- 装 tailscale、curl、jq
- 把仓库固定同步到 `/opt/meme`(这样以后 bootstrap 找得到)
- 跑 `start_fish_s2_server.py`,**下载 fish-speech 模型 + 建 venv**(慢,几十分钟)
- 装一个开机自动跑的 systemd unit
- 清掉 machine-id、日志、history,让快照能被多台机克隆

看到最后那行 `[OK] golden image prepared.` 就结束。

### 4.4 关机打快照

⚠️ **快照前务必先关机**(不要在运行中打,容易出脏快照):

```bash
poweroff
```

然后到云控制台:
- **AWS**: EC2 → 选实例 → Actions → Image and templates → Create image
- **Aliyun**: ECS → 实例 → 更多 → 云盘和镜像 → 创建自定义镜像
- **GCP**: Compute Engine → Machine images → Create

给镜像起个名字,例如 `memec-gpu-worker-v1`。**记住这个镜像 ID**。

做完快照后,**这台原始 GPU 机可以释放掉**(它的使命已经结束)。

---

## 五、每次加新 GPU 节点

从刚才的镜像起一台新实例,**关键是在"cloud-init 自定义数据 / userdata"里填这段**:

```yaml
#cloud-config
write_files:
  - path: /etc/memec-bootstrap.env
    permissions: '0600'
    content: |
      TS_AUTHKEY=tskey-auth-xxxxxxxxxxxxxxxxxxxxxx
      MEMEC_BACKEND_URL=http://100.64.0.1:8090
      MEMEC_CLUSTER_TOKEN=8060c13da2cf86913c604b75b90c7a9259a18a5a74ca659d7786a57cf0980752
      MEMEC_REGION=sa-riyadh
```

需要改的 4 处:
1. `TS_AUTHKEY` → 2.1 那里生成的
2. `MEMEC_BACKEND_URL` 的 IP → 3.2 记下的 backend tailscale IP
3. `MEMEC_CLUSTER_TOKEN` → 保持和 backend 一致(就是上面这串)
4. `MEMEC_REGION` → 随便起个标签,例如 `sa-riyadh` / `us-west` / `hk-1`

开机后 **1–3 分钟内** 会自动:
1. Tailscale 入网,拿一个 `100.x.x.x`
2. 按 GPU 数起 `fish-s2-pro-gpu{0..N}` 服务,监听 tailscale IP
3. POST 注册到 backend
4. 每 30 秒打一次心跳

### 验证新节点上线了

在 backend 机上:

```bash
curl -s -H "X-Cluster-Token: 8060c13da2cf86913c604b75b90c7a9259a18a5a74ca659d7786a57cf0980752" \
  http://127.0.0.1:8090/api/internal/nodes | jq
```

应该能看到新节点的 `tailscale_ip` / `gpu_count` / `region`。

再看 backend 日志:

```bash
tail -f /root/meme/meme-c/logs/backend.log | grep pool
```

会出现 `[pool] added upstreams: http://100.x.x.x:8080,...`。

再访问 `/api/health`,`fish_api_bases` 里应该就有新节点了。

---

## 六、日常运维

### 看当前集群状态

```bash
# 节点列表
curl -s -H "X-Cluster-Token: <token>" http://127.0.0.1:8090/api/internal/nodes | jq

# tailscale 视角
tailscale status
```

### 让一台节点优雅下线

在 backend 机上:

```bash
curl -X POST \
  -H "X-Cluster-Token: <token>" \
  -H "Content-Type: application/json" \
  -d '{"node_id":"要下线的node_id"}' \
  http://127.0.0.1:8090/api/internal/nodes/deregister
```

60 秒内 backend 就把它从 upstream 池里踢出来。然后你就能安全销毁那台机。

### 节点挂了 backend 会怎样

- **60 秒内**:backend 还以为它活着,请求会失败,代码里有兜底重试机制切到其他节点
- **60 秒后**:backend reconciler 发现 `last_seen_at` 超时,自动踢出池
- 不需要人工干预

### 换 backend 地址了怎么办

在节点机上:

```bash
vim /etc/memec-node.env       # 改 MEMEC_BACKEND_URL
systemctl restart memec-heartbeat.timer
```

---

## 七、常见问题

**Q: 我重启 backend 会怎样?**
A: 节点不受影响,backend 起来后 10 秒内从 DB 重新恢复节点列表。

**Q: 我重启一台节点会怎样?**
A: tailscale 保留 IP,fish 服务 systemd 自动拉起,heartbeat 继续。backend 不会察觉到波动。

**Q: TS_AUTHKEY 到期了?**
A: 之前已经入网的节点不受影响(它们有自己的 device key)。只是新开节点时要换一把新 authkey。

**Q: 为什么 fish API 一定要绑 tailscale IP 不走公网?**
A: 公网暴露 fish 相当于谁都能白嫖你的 GPU 合成。Tailscale 私网只有你的 tailnet 成员能访问,等于零配置内网。

**Q: 跨洲延迟会不会很慢?**
A: 注册/心跳走的是毫秒级小包,完全无感。TTS 合成的音频回传才占带宽,200ms 单程延迟对音频任务(几秒级)影响很小。真要极致优化就在每个 region 各放一台 backend。

**Q: 我能不用 Tailscale 吗?**
A: 能,但要自己搞定 3 件事:节点间私网连通、认证加密、NAT 穿透。用 Tailscale 就是图省这些事。

---

## 八、文件索引

```
meme-c/backend/
  nodes.go                       # 注册/心跳/列表 API
  upstream_pool.go               # 动态 upstream 池 + reconciler
  migrations.go                  # cluster_nodes 表

meme-c/scripts/deploy.sh         # backend 部署,带 MEMEC_CLUSTER_TOKEN

meme/setup_fish_s2_service.sh    # fish 服务 systemd 生成(支持 FISH_LISTEN_HOST)
meme/scripts/node-bootstrap.sh   # 节点首次开机跑的脚本
meme/scripts/build-gpu-image.sh  # 打黄金镜像
```
