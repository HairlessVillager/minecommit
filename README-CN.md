[English](/README.md) | 中文

<div align="center">

![logo](./minecommit-gui/src-tauri/icons/128x128@2x.png)

# MineCommit

**基于 Git 的 Minecraft 存档版本控制**

[![License: Apache-2.0 OR MIT](https://img.shields.io/badge/License-Apache--2.0%20OR%20MIT-blue.svg)](#-license)
[![Built with Rust](https://img.shields.io/badge/Built%20with-Rust-orange?logo=rust&logoColor=white)](https://www.rust-lang.org/)
[![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20Linux%20%7C%20MasOS-lightgrey?logo=github)](https://github.com/HairlessVillager/minecommit/releases)

</div>

---

MineCommit 是一个工具，将 Minecraft 存档目录下的文件转换为**Git 友好的**格式。利用 Git 成熟的版本控制功能和 Delta 压缩算法，MineCommit 实现了以下功能：

- 🗜️ **极高的空间效率**: 每个增量备份平均仅占用原始存档空间的一小部分
- ⚡ **快速备份和恢复**: 利用 [`rayon`](https://github.com/rayon-rs/rayon) 实现流式并行处理，利用 [`simdnbt`](https://github.com/azalea-rs/simdnbt) 解析 NBT 文件，并通过 [`gitoxide`](https://github.com/GitoxideLabs/gitoxide) 进行 Git I/O 操作。

如果有任何问题，欢迎阅读 [FAQ.md](docs/FAQ.md)，或随时提交 Issue。

## 🚀 快速上手

### 前提条件

MineCommit 依赖外部的 `git` 二进制文件来执行 `commit` 和 `checkout` 命令。如果未安装 Git，请先 [安装 Git](https://git-scm.com/install/)。

### 使用 GUI (图形用户界面)

> [!NOTE]
> 仍在开发中，即将推出。

我们为 Windows 和 Linux 提供了 GUI 版本。请从 [GitHub Release](https://github.com/HairlessVillager/minecommit/releases) 页面下载 `minecommit-gui` 可执行文件。

该 GUI 使用了 [Tauri](https://tauri.app/) + [React](https://react.dev/) + [shadcn/ui](https://ui.shadcn.com/) 构建，提供了一个所见即所得 (WYSIWYG) 的界面，用于基本的备份和恢复工作流。

### 使用 CLI (命令行接口)

CLI 提供了对执行细节的精细控制。您可以从 [GitHub Release](https://github.com/HairlessVillager/minecommit/releases) 获取它，或自行构建：

```sh
cargo install --path . --bin minecommit
```

> [!NOTE]
> 从源代码构建需要最新的 **Rust Nightly** 工具链（因为使用了 `simdnbt`）。请通过 [rustup](https://rustup.rs/) 安装：`rustup toolchain install nightly`。

#### 步骤 1: 准备工作

您需要提供以下两个路径：

1. **存档路径 (`$SAVE_DIR`)**: `.minecraft/saves/` 下的存档目录（包含 `level.dat`）。
2. **Git 仓库路径 (`$GIT_DIR`)**: 用于存储备份数据的裸 Git 仓库。

#### 步骤 2: 初始化 Git 仓库

对于第一次备份，请创建一个裸 Git 仓库：

```sh
git init --initial-branch main --bare $GIT_DIR
git --git-dir $GIT_DIR config gc.auto 0
git --git-dir $GIT_DIR config core.logAllRefUpdates true
```

确保设置了您的 Git 提交身份：

```sh
git config user.name
git config user.email
```

如果没有任何输出，请设置您的全局 Git 身份：

```sh
git config --global user.name $YOUR_USER_NAME
git config --global user.email $YOUR_USER_EMAIL
```

#### 步骤 3: 执行备份

```sh
minecommit commit $SAVE_DIR $GIT_DIR --branch main --init --message "Your backup note" --repack
```

这会读取 `$SAVE_DIR` 的存档，在 `$GIT_DIR` 的裸仓库中为 `main` 分支创建初始提交，并自动重新打包松散对象。

<details>
<summary><code>minecommit commit --help</code></summary>

```text
Flatten save and commit to Git

Usage: minecommit commit [OPTIONS] --branch <BRANCH> --message <MESSAGE> <SAVE_DIR> <GIT_DIR>

Arguments:
  <SAVE_DIR>  Path to your save
  <GIT_DIR>   Path to the bare Git repository

Options:
  -b, --branch <BRANCH>                    Commit to this branch
  -v, --verbose...                         Increase logging verbosity
      --init                               Commit as initial commit
  -q, --quiet...                           Decrease logging verbosity
  -m, --message <MESSAGE>                  Commit message
      --repack                             Automatically repack loose objects
  -p, --extra-patterns <EXTRA_PATTERNS>    Glob patterns to additionally include
  -i, --ignore-patterns <IGNORE_PATTERNS>  Glob patterns to explicit ignore
  -h, --help                               Print help
```

</details>

#### 步骤 4: 恢复备份

如果 `$SAVE_DIR` 已存在，MineCommit 会将其重命名为 `$SAVE_DIR.bak`，然后再进行恢复。

```sh
minecommit checkout $SAVE_DIR $GIT_DIR --commit "main~1"
# 将存档恢复到 main 分支的上一个提交 (previous commit)
```

<details>
<summary><code>minecommit checkout --help</code></summary>

```text
Restore save from commit

Usage: minecommit checkout --commit <COMMIT> <SAVE_DIR> <GIT_DIR>

Arguments:
  <SAVE_DIR>  Path to your save
  <GIT_DIR>   Path to the bare Git repository

Options:
  -c, --commit <COMMIT>  Commit-ish to checkout (commit ID or revision expression, e.g. HEAD~1, branch~2)
  -h, --help             Print help
```

</details>

### 其他命令

<details>
<summary>Flatten / Unflatten (不使用 Git)</summary>

如果您想将存档扁平化到纯粹的文件系统目录，而不是提交到 Git 仓库，请使用 `flatten` 和 `unflatten` 命令：

```sh
# 扁平化存档
minecommit flatten $SAVE_DIR $FLATTENED_DIR

# 去扁平化存档
minecommit unflatten $SAVE_DIR $FLATTENED_DIR
```

</details>

<details>
<summary>调试工具</summary>

```sh
# 将区块 NBT 数据转储到标准输出
minecommit utils chunk $REGION_FILE --chunk-x 0 --chunk-z 0
```

</details>

## 🔬 工作原理

MineCommit 的设计基于这样一个观察：Minecraft 存档的大部分数据量集中在 `region/*.mca` 文件中，这些文件中包含大量的空间冗余（跨区块的重复方块和生物群系）和时间冗余（相邻备份之间差异极小）。

MineCommit 通过一个处理程序流水线，将复杂的 `.mca` 二进制格式扁平化为小型、可供 Git 差分处理的文件：

| 处理程序                | 输入模式                | 描述                                          |
| :---------------------- | :---------------------- | :-------------------------------------------- |
| `ChunkRegionHandler`    | `**/region/r.*.*.mca`   | 将区块 NBT 分割为每个区块的独立部分和其它数据 |
| `EntitiesRegionHandler` | `**/entities/r.*.*.mca` | 扁平化实体区域文件                            |
| `PoiRegionHandler`      | `**/poi/r.*.*.mca`      | 扁平化兴趣点（Point-of-Interest）区域文件     |
| `GzipNbtHandler`        | `**/*.dat`              | 解压缩并处理 Gzip 加密的 NBT 文件             |
| `RawHandler`            | 用户定义                | 原样复制任意文件                              |
| `IgnoreHandler`         | 用户定义                | 明确忽略匹配的文件                            |

每个处理程序都在自己命名空间的工作区内运行。对象数据库（ODB）抽象层将存储与处理程序逻辑解耦，支持本地文件系统后端 (`LocalFsOdb`) 和基于 Git 的存储后端 (`LocalGitOdb`)，并通过 `rayon` 实现并行读写操作。

## 🗺️ 路线图

- [x] `minecommit flatten`: 将存档文件解构成扁平化格式
- [x] `minecommit unflatten`: 从扁平化格式重构存档文件
- [x] `minecommit commit`: 流式扁平化和提交到 Git
- [x] `minecommit checkout`: 从 Git 检出并流式恢复存档
- [x] 处理程序流水线: `ChunkRegion`, `EntitiesRegion`, `PoiRegion`, `GzipNbt`, `Raw`, `Ignore`
- [x] ODB 抽象层：支持文件系统和 Git 后端，具备并行 I/O 功能
- [x] 基本 GUI 骨架 (Tauri + React + shadcn/ui)
- [x] CI/CD 流水线，用于自动化构建（Windows, Linux, macOS）
- [x] 模组数据处理程序：支持流行模组（例如 SDMEconomy, CosArmor）
- [ ] GUI 功能完整实现
    - [ ] 与后端整合的提交 / 恢复功能
    - [ ] 推送到远程仓库 / 从远程拉取
    - [ ] 提交历史记录浏览器
    - [ ] 存档大小分析仪表盘
- [ ] Blob 对象文本化处理
    - [ ] `minecommit merge`: 区块级别和游戏语义级别的合并功能
    - [ ] `minecommit diff`: 快速查看两次提交之间的差异
    - [ ] `minecommit blame`: 方块级别的历史追踪
- [ ] 基于 Minecraft 地形生成算法的区块去重

## 🤝 贡献

最简单的贡献方式就是使用 MineCommit 本身。您可以在游戏过程中对您的存档使用它进行测试。

如果您遇到任何问题，请随时提交 Issue。

有关开发指南，请阅读 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 🙏 致谢

特别感谢 [`gitoxide` 项目](https://github.com/GitoxideLabs/gitoxide)（使用 MIT / Apache-2.0 许可开源），它提供了一个高效且现代的 Git 兼容实现。

感谢 [`simdnbt` 项目](https://github.com/azalea-rs/simdnbt)（使用 MIT 许可开源），它的 NBT 序列化/反序列化让人印象深刻。

感谢 Lewis，他提供了用于真实世界测试的 4.6 GiB 存档。我们在开发早期缺乏大量的实际实验数据。

感谢所有在项目早期阶段关注本项目的用户。您的提问和反馈是推动本项目前进的动力。

## 📄 许可证

根据您的选择，可采用以下任一许可证：

- Apache License, Version 2.0 ([LICENSE-APACHE](./LICENSE-APACHE) 或 http://www.apache.org/licenses/LICENSE-2.0)
- MIT license ([LICENSE-MIT](./LICENSE-MIT) 或 http://opensource.org/licenses/MIT)
