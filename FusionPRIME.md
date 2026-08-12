<!-- 这个注释不要删除, 文档中尽可能使用中文叙述, 单段落不换行. 标点符号尽可能用英文的, 专有名词或不适合翻译的术语使用英文的 -->

# FusionPRIME 架构设计

**FusionPRIME**: Fusion Plasma Reactive Integrated Modeling Environment

FusionPRIME 是面向聚变等离子体集成建模的响应式计算生态, 由 Energeia-Harmonia 核心架构组成. 架构命名借用亚里士多德的一对概念, 对应可执行的物理过程与这些过程之间的组合关系:

- **Energeia (现实活动):** 表示可执行的物理过程. Energeia 计算域由公共 `energeia` 契约包和独立发行的物理 Module 共同组成; 前者定义 State, 执行与导数协议, 后者实现具体数值计算.
- **Harmonia (和谐关系):** 负责将 Module 组织为 Workflow, 求解跨物理过程的反馈关系, 并管理 State 版本, Commit 和 History.

物理模块设计的相关概念:

- **State:** 表示一类可在 Module 之间传递和版本化的物理状态, 同时携带网格, 时间等语义.
- **Adapter:** 在具体 Module 内部, 将合法的 State 转换为其 Kernel 所需的网格和时间切片.
- **Kernel:** Module 内部适合高频调用的数值计算核心, 不感知 State, 只进行纯粹的数值计算.
- **Record:** Module 执行的不可变记录, 保存求解状态和诊断, 通过验收时可物化 State.
- **Module:** 实现一个可独立运行的物理过程, 通过统一协议组织 Adapter, Kernel 和 Record.

工作流的组织和节点:

- **Bundle:** 使多个直接数据上相互独立的分支读取同一入口 State 集合快照, 通过验收后原子地合并各分支产生的 State.
- **Cycle:** 包含跨物理反馈关系的耦合组合, 在同一物理步内通过指定的非线性求解器获得自洽 State.
- **Workflow:** 一次完整集成计算的顶层对象, 按声明顺序组织一组 Node, 并通过 schedule 指定单次, 固定次数, 时间网格或终止条件. 每个 Workflow 实例只执行一次并拥有唯一 History; Workflow 不是 Node, 也不允许嵌套.

Module, Bundle 和 Cycle 是全部三种 Node. Module 是不包含其他 Node 的叶节点; Bundle 的各分支与 Cycle 的 body 则直接保存有序 Node 元组, 并可以递归包含 Bundle 或 Cycle. 整个定义必须形成有限无环的包含树; Bundle 的分支不得存在直接反馈或未定义的 State 写入冲突, Cycle 必须显式声明反馈 State 与求解器.

状态更新和历史记录:

- **Commit:** 记录展开流中一个顶层 Node 通过验收后的完整 State 版本组合, 并通过父 Commit 构成可分支的状态谱系. Commit 不包含子 Commit; Bundle 和 Cycle 的内部过程直接保存在 History 的对应节点下.
- **Branch:** 对某一 Commit 的可移动命名引用. 从历史 Commit 创建新 Workflow 时, 新 Commit 会形成独立分支, 不改变原有谱系.
- **Head:** Workflow 当前已验收 State 集合所对应的 Commit. 每个顶层 Node 成功后 Head 向前移动, 节点失败时则停留在最后一个成功 Commit.
- **History:** 与 Workflow 实例一一对应, 按 schedule 展开后的节点位置保存执行状态, Record, Bundle 与 Cycle 诊断, Commit 和 State 版本, 用于恢复, 分支, 比较和可视化.

`energeia` 是所有物理 Module 与 Harmonia 共同依赖的底层契约包. 它定义跨 Module 稳定的物理 State, 执行协议, 导数协议和公共数值原语, 但不包含具体物理求解器, 也不负责 Workflow 编排:

```text
energeia/
├── contract/
├── state/
│   ├── current/
│   ├── equilibrium/
│   ├── kinetic/
│   └── source/
├── numerics/
└── view/
```

每个具体 Module 都作为独立 Python 包发行, 并组织为一致的形式:

```text
veqpy/
├── adapter/
├── record/
├── kernel/
│   ├── cxx_kernel/
│   └── numba_kernel/
└── view/
```

Module 的公开入口接收 Energeia State, 由自己的 Adapter 完成坐标, 网格, 单位与时间切片转换, 再调用内部 Kernel. `energeia` 定义公共不可变的 Record, 用于保存一次 Module 具体求解过程的执行状态, 计时, 迭代计数, Kernel 与 fallback 路径, 错误摘要, provenance 以及 State 物化所需的输出. Module 内部的 `record` 将 Kernel 输出与诊断解释为该公共 Record. 只有通过求解与物理验收的 Record 才会物化为 State; 失败的 Record 返回 `State=None`, 其初始猜测, 最后迭代值和残差等候选数据仍保留在 Record 中, 供诊断, 可视化或后续热启动使用. Record 不反向引用 Workflow, Commit 或 History:

```text
State
    ↓
Adapter
    ↓
Module-specific Input
    ↓
Kernel
    ↓
Module-specific Output
    ↓
Record
├── succeed → State
└── failed  → None
```

每个 Module 还必须提供一致的命令行入口, 使其可以在不建立 Harmonia Workflow 的情况下独立检查和运行:

```bash
python -m veqpy --demo [numba|cxx]
python -m veqpy --version
python -m veqpy --check
python -m veqpy --links
```

**Harmonia** 是将 Module 组合为 Workflow, 并管理 State 版本组合, Commit, Head 和 History 的上层包. Harmonia 使用 Energeia 定义的物理 State 和执行协议, 但不定义具体物理字段, 也不依赖任何特定 Module:

```text
harmonia/
├── bundle/
├── cycle/
├── history/
├── module/
├── view/
└── workflow/
```

实际依赖为:

```text
veqpy/mcdpy/vtspy → energeia
harmonia          → energeia
```

具体 Module 与 Harmonia 共同依赖 `energeia`. 用户应用作为组合入口选择 Harmonia 与所需 Module; Harmonia 不直接导入任何具体 Module, Module 也不导入 Harmonia.

`energeia.view` 负责通用 State 的物理展示, Module 内部的 `view` 负责求解过程可视化, `harmonia.view` 则负责 Workflow, Commit 和 History 的跨节点展示.

## OpenMDAO

**OpenMDAO** 是 Harmonia 的一个重要依赖, 用于构建和求解多学科优化问题, 连接模块化的物理模型, 并根据各模块提供或数值近似的局部导数计算 Workflow 的总导数.

- 网页: https://openmdao.org
- 论文: https://doi.org/10.1007/s00158-019-02211-z
- 代码: https://github.com/OpenMDAO/OpenMDAO

**FusionPRIME 将 OpenMDAO 作为 Harmonia 的执行和总导数底座.** Harmonia 将 Workflow 编译为 OpenMDAO 计算图, 再通过 Energeia 的 Module 协议调用具体 Module. OpenMDAO 不拥有 State 版本, Commit 或 History, 具体 Module 也不感知 Workflow 的存在:

```text
[Harmonia]  Workflow / schedule / Module / Bundle / Cycle / Commit / History
    |
    | compiles to
    v
[OpenMDAO]  execution / total derivatives
    |
    | invokes through the Energeia Module protocol
    v
[Modules]  VEQPy / MCDPy / VTSPy
    |
    | Module -> Adapter -> Kernel -> Record + State
    v
[Energeia]  State / contracts / numerics
```

Harmonia 将 Workflow 编译为顶层 OpenMDAO Group, 并递归编译三种 Node. Module 编译为 Component; Bundle 编译为 Group, 在分支满足并行条件时使用 ParallelGroup; Cycle 编译为拥有 nonlinear solver 和按需配置 linear solver 的 Group. Bundle 分支和 Cycle body 中的有序 Node 元组会生成内部 Group, 但不物化为嵌套 Workflow. schedule 在语义上将 Workflow body 展开为连续的节点流, 实现上则重用同一份已编译计算图. OpenMDAO 负责单次 body 中的数据连接, 并行调度, 非线性求解与总导数; Harmonia 负责 schedule 调度, 物理验收, Commit 和 History.

## IMAS

**IMAS** (Integrated Modelling & Analysis Suite) 是 ITER 组织开发的聚变等离子体集成建模数据结构和接口标准, 核心由 Data Dictionary 和 Access Layer 组成. Data Dictionary 定义 IDS, 字段, 单位和坐标, Access Layer 提供对 IDS 的存储与访问接口. IDS 定义了聚变等离子体模拟中常用的物理量及其组织方式, API 定义了对 IDS 的访问方式.

- 网页: https://imas-python.readthedocs.io/en/stable/
- 论文: https://doi.org/10.1088/0029-5515/55/12/123006
- 代码: https://github.com/iterorganization/IMAS-Python

**FusionPRIME 可以从 IMAS IDS 初始化 State, 也可以将计算结果导出为 IMAS IDS.** IMAS 只存在于可选的数据交换边界, FusionPRIME 在 Workflow 运行过程中使用自己的 State, 不要求 IMAS-Python 成为核心依赖.

```text
[IMAS] IDS / Access Layer API
    |
    | optional import
    |
[FusionPRIME] State / Commit / History
    |
    | optional export
    |
[IMAS] IDS / Access Layer API
```

---

# 1. 响应式数据流的 State

- 解决单个物理对象内部的一致性
- 最小计算量以及惰性更新机制

**聚变模型中的物理量往往彼此依赖.** 例如平衡位形改变后, 磁面坐标, Jacobian, 体积和一维几何因子都应随之更新. 如果由开发者手动维护更新顺序和缓存:

1. 容易留下数值看似正常但已经过期的派生量;
2. 容易进行大量多余的物理量计算或更新;
3. 无法自动将计算延迟到真正需要它的阶段.

IMAS IDS 中往往存在大量相互关联但并非每次都需要的字段. 一个输入变化不应导致所有派生物理量都被重新计算, 面向 IMAS 的一次局部读取或字段映射也不需要先构造和填满所有可选派生字段. IMAS.jl 已经支持按需 expression, 但 dynamic expression 会在每次访问时重新计算, onetime expression 缓存后则需要开发者手动刷新.

FusionPRIME 通过显式依赖图和版本标记, 只在派生量首次被访问, 或其依赖变化后再次被访问时计算. FusionPRIME 因此显式声明独立的 root property, 并从派生 property 的物理公式中建立依赖关系.

Reactive 对象内部的属性依赖必须构成 DAG (Directed Acyclic Graph). 跨物理过程的反馈关系不表示为属性之间的循环依赖, 而由 Workflow 中的 Cycle 使用指定的非线性求解器求得自洽解.

例如, 关系 $y = x^2, z = ay, w = 2a$ 形成如下 DAG:

```text
x → y → z
a ────→ z
a ────→ w
```

```python
class Derived(Reactive):
    root_properties = {"x", "a"}

    def __init__(self, x, a):
        super().__init__()
        self.x = x
        self.a = a

    @property
    def y(self):
        return self.x**2

    @property
    def z(self):
        return self.a * self.y

    @property
    def w(self):
        return 2 * self.a
```

系统会自动建立多条依赖分支. 修改 `x` 时, 只有 `y` 和 `z` 可能失效; 如果从未访问 `w`, 则 `w` 从始至终都不会被计算. 对 `a` 的修改同理, **未改变的分支继续复用缓存, 未访问的派生量不产生计算成本.**

```python
derived = Derived(x=2, a=10)
print(derived.z)  # 只计算 y 和 z, 输出 40

derived.x = 3  # y 和 z 失效
print(derived.z)  # 重新计算 y 和 z, 输出 90

derived.a = 20  # z 失效, y 不受影响
print(derived.w)  # 此时 w 才进行第一次计算, 输出 40
```

**这种设计同时保证了更新的正确性, 计算范围的最小化和派生数据的延迟物化.** 常规依赖由 AST (Abstract Syntax Tree) 自动识别, 无法静态分析的动态依赖也可以通过 `depends_on` 显式声明.

Reactive 用于物理对象和派生诊断. 而数值热循环、残差评估、时间推进和非线性迭代仍由编译内核和显式 workspace 执行, 因此 Reactive 语义不会进入高频计算路径.

---

# 2. 异构可微 Workflow

- 声明好的物理组合关系如何成为 Workflow
- 从不同数值求解和导数形式的模块组合中获取总导数

FusionPRIME 可以计算完整 Workflow 中可微输出对初始状态, 模型参数和控制量的总导数, 并据此进行敏感性分析, 参数反演, 梯度优化和控制设计.

可微分是 Module 对外提供的能力, 而不是对内部实现方式的限制. 这避免了要求所有 Module 使用相同的数值实现或局部导数生成方式, 使得不同模块可以使用不同的数值求解和导数计算技术栈, 例如 Numba, JAX 或 PyTorch. Module 可以提供解析 Jacobian, JVP 或 VJP, 也可以在内部使用 AD, 隐式微分, complex step 或 finite difference. 因此, 同一个 Workflow 可以组合多种局部导数形式和代码实现, 不要求所有模块和求解过程都改写为同一套 AD primitive.

Module 对外提供的导数覆盖从输入 State 到输出 State 的完整映射, 因此也包括 Adapter 内的坐标与网格转换, 而不只是 Kernel 内部数组之间的导数. Harmonia 将 Module 提供的 Jacobian, JVP 或 VJP 统一为 OpenMDAO 可使用的局部线性算子; 同时提供 JVP 与 VJP 时, Workflow 可以根据设计变量与响应的维度选择 forward 或 reverse 总导数模式. 在一次 body 内, 有序 Node 元组按顺序应用链式法则, Bundle 将输入扰动传播到各条独立分支并在反向传播时汇总梯度, Cycle 则在自洽解收敛后求解耦合线性系统以获得隐式导数, 不需要反向展开非线性迭代历史. schedule 再将每次 body 的状态转移导数按次序连接; 长时间序列可以结合 checkpoint 和反向传播策略控制内存与重算成本. 如果完整的输入到输出路径包含未提供导数, 离散切换或不光滑操作, Workflow 则应显式使用数值近似或声明该路径不可微.

---

# 3. 基于 Commit 的 Workflow 执行与 History 管理

- 每个 Workflow 实例只执行一次, 并与自己的 History 一一对应
- schedule 将 Workflow body 展开为连续的顶层 Node 流
- 每个顶层 Module, Bundle 或 Cycle 通过验收后至多创建一个 Commit
- 每次提交只增加实际产生的 State 版本, 未变化的 State 继续复用
- 任意 Commit 都可以恢复为完整 State 集合, 并作为新 Workflow 的输入

**集成模拟的当前状态不是单个数据对象, 而是多个物理 State 版本的组合.** FusionPRIME 将每类物理 State 独立版本化, Commit 记录一个顶层 Node 通过验收后的完整 State 版本组合, History 则直接记录 schedule 展开后的节点调用及其内部过程.

### Workflow 与 History

一个 Workflow 实例同时包含 Node 元组, schedule, 入口 `base_commit`, 目标 Branch 和唯一 History. Workflow 实例只执行一次; 需要使用相同节点配置从另一 Commit 重新计算时, 创建新 Workflow 实例即可.

```python
workflow = Workflow(
    Bundle(FusionHeating(), Radiation()),
    Cycle(VTS(), MCD(), VEQ(), solver=NonlinearBlockGS(rtol=1e-2)),
    schedule=TimeGrid(t0=0.0, t1=10.0, dt=0.1),
    base_commit=C0,
    branch="main",
)

workflow.execute()
history = workflow.history
```

History 按 `(schedule_index, node_path)` 标识每次节点调用. 顶层 `node_path` 只包含 Node 在 Workflow body 中的位置, Bundle 分支和 Cycle 迭代则在该路径后追加分支或迭代索引. Module 节点保存 Record, Bundle 节点保存分支记录与合并诊断, Cycle 节点保存内部迭代的 Module Record 和求解诊断. 因此, History 本身已经完整表示节点的嵌套结构与运行结果.

### schedule 的逻辑展开

schedule 将 Workflow body 视为一个整体并按顺序重复. `Once()` 只执行一次, `Count(N)` 和 `TimeGrid(...)` 展开为已知长度的节点流, 依赖终止条件的 schedule 则在运行期惰性展开. 如果 body 为 `A → B → C`, `Count(3)` 的语义为:

```text
A₀ → B₀ → C₀ → A₁ → B₁ → C₁ → A₂ → B₂ → C₂
```

每个成功 Node 的输出 State 集合直接作为下一 Node 的输入, 不在 schedule 边界创建额外层级. 逻辑展开也不意味着复制或重新编译 N 份 OpenMDAO 计算图; Harmonia 重用同一份已编译 body, 只为 History 中的每次调用分配不同路径. 数值积分的内部子步仍属于具体 Module.

### Commit 边界与递归组合

Workflow body 展开后的每个顶层 Node 都是一个 Commit 边界. 顶层 Module 通过验收后至多创建一个 Commit; 顶层 Bundle 只在所有分支成功, 输出无冲突且合并验收通过后至多创建一个 Commit; 顶层 Cycle 只在数值求解收敛且物理验收通过后至多创建一个 Commit. 不改变 State 集合的 Node 不创建空 Commit.

嵌套在 Bundle 或 Cycle 内部的 Node 只产生候选 State 和运行记录, 不创建 Commit, 也不移动 Head. 外层 Commit 不包含子 Commit; Bundle 的分支结果和 Cycle 的迭代过程直接保存在对应 History 节点下.

| Node   | 顶层调用的 Commit 语义                   | History 中的内部记录               |
| ------ | ---------------------------------------- | ---------------------------------- |
| Module | 验收通过且改变 State 时创建 1 个 Commit  | Module Record                      |
| Bundle | 所有分支合并验收后创建至多 1 个 Commit   | 分支记录, 候选 State 与合并诊断    |
| Cycle  | 数值收敛且物理验收后创建至多 1 个 Commit | 迭代 Record, 候选 State 与求解诊断 |

Bundle 和 Cycle 可以递归包含对方或同类 Node, 因为 OpenMDAO Group 与 History 都可以按相同结构递归构造, 因此 API 不设人为嵌套层数上限. Bundle 必须保持分支独立并明确 State 合并规则, Cycle 必须拥有明确的反馈边界; 没有独立并行或分层求解语义的冗余容器可以在编译时扁平化.

顶层 Node 失败时, History 保留该节点的 Record 或诊断, 但不创建 Commit, Workflow 也不继续执行后续节点. Head 因此停留在最后一个成功 Node 的 Commit, 用户可以直接从该状态恢复或创建新 Workflow.

### Commit 与 State 版本

一个 Commit 在逻辑上记录完整的 State 集合, 但存储上只增加本次实际产生的 State 版本, 未改变的 State 继续引用父 Commit 中的版本. 内部可以使用具有结构共享的 `Map[StateKey, StateVersionID]` 表示这个集合, 因此恢复任意 Commit 不需要从初始状态重放所有 delta, 创建新 Commit 也不需要复制整个 State 集合.

```text
State Store
Equilibrium: E0 → E1
Kinetic:     K0 → K1 → K2
Current:     J0 → J1

Commit Lineage
C0  (E0, K0, J0)
C1  (E1, K0, J0)  changes={Equilibrium: E1}
C2  (E1, K1, J1)  changes={Kinetic: K1, Current: J1}
C3  (E1, K2, J1)  changes={Kinetic: K2} ← Head
```

Commit 使用稳定 CommitID 而不是列表索引作为身份, 并至少保存 `parent`, `states`, `changes`, `produced_by` 和逻辑时间. `parent` 只表示 State 演化顺序; `produced_by` 使用 WorkflowID 与 `(schedule_index, node_path)` 指向 History 中产生该 Commit 的顶层节点. 节点嵌套关系不由 Commit 表达.

### 从任意 Commit 恢复与分支

一个 Workflow 正常执行时, 其 Commit 沿节点展开顺序形成线性链. 用户从历史 Commit 恢复后创建新 Workflow 时, 新 History 的 `base_commit` 引用该 Commit, 后续 Commit 以它为父节点形成新分支; 原 Workflow 的 History 保持不变:

```text
C0 → C1 → C2 → C3  main
          └→ D1 → D2  experiment
```

新 Workflow 可以复用原节点配置, 也可以使用另一组 Node 和 schedule. 新旧 History 通过 Commit 引用共享已有 State 版本, 不复制历史数据.

初始实现中每个 Commit 只允许一个父节点, 因此无分支时 Commit 谱系是链, 有分支时是树. 不同分支的物理 State 不应像文本一样自动合并; 如果未来引入显式的物理合并节点和多父 Commit, 谱系才会从树扩展为 DAG.

### History 的存储形态

History 直接保存一个 Workflow 的配置, 节点调用记录和新产生的物理数据:

```text
History
├── workflow: ID / nodes / schedule / base_commit / branch / status
├── nodes: (schedule_index, node_path) → time / status / Record / diagnostics / CommitID
├── state_versions: StateVersionID → State
├── commits: CommitID → Commit
└── head: CommitID
```

`nodes` 与 schedule 的逻辑展开一一对应, 并在 Bundle 和 Cycle 处按物理组合关系嵌套. 节点失败时仍保留 Record 和诊断, 但 CommitID 为 `None`. `state_versions` 和 `commits` 可以与旧 History 结构共享, 因此 Workflow 与 History 一一对应不会导致 State 或 Commit 数据复制.

这种设计在语义上接近 Git: Commit 表示可恢复的完整状态, parent 构成谱系, Branch 和 Head 是可移动引用, 从历史 Commit 创建新 Workflow 会产生新分支. FusionPRIME 不复制 Git 的文件和文本合并模型; 它额外管理物理 State 版本, Module Record, Bundle 与 Cycle 诊断以及逻辑时间.

IMAS 已经按照 equilibrium, core profiles, sources 等物理概念划分 IDS, 也允许独立读写单个 IDS, 但没有统一管理各 IDS 的版本谱系, 也没有由一个 Commit 统一记录当前完整 IDS 版本组合的机制. FusionPRIME 的 History 同时保存可恢复的物理状态和可追溯的执行结构, 可以快速还原任意 Commit, 追踪每个 State 版本的产生来源, 并基于紧凑的版本数据进行逐节点和跨分支可视化与结果比较.

---

# 4. 面向高性能计算的职责分离架构

FusionPRIME 通过 State, Adapter, Kernel 与 Record 分离物理状态, 模块数据转换, 高频计算和求解过程记录. Module 只读取和产生显式声明的 State, 不持有或修改 History 中的完整 State 集合, 也不感知 Workflow, Commit 和 History. Harmonia 只在顶层 Node 的求解与物理验收全部通过后, 才将候选 State 保存为新版本并创建 Commit. 嵌套 Module 执行失败, Bundle 分支失败或输出冲突, Cycle 未收敛或未通过物理验收时, 所属顶层 Node 不创建 Commit, History 则保留 Record 与相关诊断. 顶层 Node 失败后 Workflow 停止, Head 保持在最后一个成功 Commit.

Adapter 属于 Module, 因为只有 Module 知道自己 Kernel 所需的坐标, 网格, 边界与守恒语义. 不同 State 可以使用不同网格, 但每个剖面都必须携带明确的坐标和几何语义; Module 内部使用 `energeia.numerics` 提供的公共插值, 投影与守恒重映射原语, 并根据物理量选择正确的转换方式. 同一个已编译 Workflow 中允许各 State 使用不同网格, 但网格点数和坐标拓扑在运行期间保持不变; 改变拓扑时应重新编译 Workflow. 这样既保留了 Module 对任意合法网格的适配能力, 又避免不同 Module 重复实现不一致的数值操作.

Reactive 只用于低频的物理对象与派生诊断, Adapter 只在 Module 边界执行必要的数据转换, Kernel 则通过编译内核, 预分配 workspace 和热启动求解保持高频残差评估的低开销. 架构边界因此不会被带入数值热循环.

VEQ, MCD, VTS 等 Module 同时是可以独立运行, 配置, 验证和诊断的完整物理过程. 用户可以直接调用 Module 的 Python API 或命令行入口, 不需要先建立 FusionPRIME Workflow. 同一 Module 对独立调用和 Harmonia 提供相同的 State 输入, Record, 可选 State 输出和导数协议, 因此单模块验证与集成 Workflow 不会演化成两套实现.
